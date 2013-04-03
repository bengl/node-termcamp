#!/usr/bin/env node

var
    Campfire    = require('campfire').Campfire,
    cli         = require('cli'),
    fs          = require('fs'),
    colors      = require('colors'),
    moment      = require('moment'),
    _           = require('underscore'),
    _s          = require('underscore.string'),
    cliOptions  = cli.parse(),
    initOptions = {},
    configFile;

_.mixin(_s.exports());

var nodeTerm = (function () {
    var
        campfire,          // Campfire connection object
        Helpers = {},      // Misc output formatting
        Commands = {},     // who, afk and other slash commands from user
        Listeners = {},    // Campfire event handlers
        Emitters = {},     // Any printing to the screen
        Formatters = {},   // Message formatting
        currentUser = {},  // Current logged in user info
        currentRoomId = 0, // We operate in a single room
        users = [],        // List of users we've looked up (not presense)
        lastUser = -1,     // Last user to speak in current room
        config = {},       // Config for campfire, user prefs + default
        defaultConfig = {  // Sensible defaults
            width: 80,           // Total screen width
            leftColumn: 17,      // Username column
            rainbowNames: false, // Not yet supported
            alerts: []           // Users first name is added during login
        },
        colors = [          // Colors for rainbow names
            'blue', 'cyan', 'green',
            'magenta', 'red', 'yellow'
        ], colorIndex = 0;

    // Process a message from the api
    // If we're dealing with the initial queue, we'll use a callback to
    // make sure that the messages stay in the correct print order because
    // some of the emitters have async lookups. Make sure we're done before
    // processing the next message.
    // TODO: I think we can leverage the underscore deferred to simplify this
    Listeners.receiveMessage = function (message, callback) {
        var
            emitterType = message.type.replace(/Message/, ''),
            emitter;

        callback = callback ? callback : console.log;

        emitter = _.isFunction(Emitters[emitterType]) ?
            Emitters[emitterType] : Emitters.Unknown;

        emitter(message, callback);
    };

    // Gets a user by id (either from memory or API) and calls the callback
    // with the user.
    Helpers.withUser = function (userid, callback) {
        // If the user is in our user list, we can immediately callback with
        // the user object
        if (users[userid]) {
            callback(users[userid]);
            return;
        }

        // Lookup this user via the api and then callback with the user object
        campfire.user(userid, function (error, user) {
            if (error) {
                console.log(("ERROR: " + error).red);
                return;
            }

            // Default name color. I like this the best.
            user.user.color = "green";

            // Cycle through our available colors if we're rainbow'd
            if (config.rainbowNames) {
                colorIndex = colorIndex + 1;
                user.user.color = colors[colorIndex % colors.length];
            }
            callback(users[userid] = user.user);
        });
    };

    // User enters room
    Emitters.Enter = function (message, printer) {
        Helpers.withUser(message.userId, function (user) {
            var formattedMessage = _.sprintf(
                "%s> %s has entered the room",
                _.repeat(" ", config.leftColumn - 2),
                user.name
            );
            printer((formattedMessage).magenta);
        });
    };

    // Simple error printing, used by nodeterm as well
    Emitters.Error = function (message, printer) {
        printer(("Error: " + message).red);
    };

    // Campfire seems to handle Kick and Leave as the same event
    Emitters.Kick = function (message, printer) {
        Emitters.Leave(message, printer);
    };

    Emitters.Leave = function (message, printer) {
        Helpers.withUser(message.userId, function (user) {
            var formattedMessage = _.sprintf(
                "%s< %s has left the room",
                _.repeat(" ", config.leftColumn - 2),
                user.name
            );
            printer((formattedMessage).magenta);
        });
    };

    // User has pasted text, we'll colorize and surround with space.
    // We don't wrap or pad to preserve copy+paste
    Emitters.Paste = function (message, printer) {
        Helpers.withUser(message.userId, function (user) {
            var formattedMessage = _.sprintf(
                ("%s pasted some text: ").green + "\n\n" + ("%s").cyan + "\n",
                Formatters.userColumn(user.name),
                message.body
            );
            printer(formattedMessage);
        });
    };

    // Sadly, we can't do a lot with these
    Emitters.Sound = function (message, printer) {
        Helpers.withUser(message.userId, function (user) {
            var formattedMessage = _.sprintf(
                "%s plays a sound: %s",
                Formatters.userColumn(user.name),
                message.body
            );
            printer((formattedMessage).yellow);
        });
    };

    // User text message. Suppress their name if they post multiple
    // messages in a row.
    Emitters.Text = function (message, printer) {
        Helpers.withUser(message.userId, function (user) {
            var formattedMessage;
            if (lastUser === message.userId) {
                formattedMessage = _.sprintf(
                    "%s%s",
                    _.repeat(" ", config.leftColumn),
                    Formatters.messageColumn(message.body.blue.bold)
                );
            }
            else {
                lastUser = message.userId;
                formattedMessage = _.sprintf(
                    ("%s:")[user.color] + " %s",
                    Formatters.userColumn(user.name),
                    Formatters.messageColumn(message.body.blue.bold)
                );
            }
            printer(formattedMessage + Formatters.appendAlert(message.body));
        });
    };

    Emitters.TopicChange = function (message, printer) {
        Helpers.withUser(message.userId, function (user) {
            var formattedMessage = _.sprintf(
                "%s changed the room's topic to '%s'",
                Formatters.userColumn(user.name),
                Formatters.messageColumn(message.body)
            );
            printer((formattedMessage).yellow);
        });
    };

    // Timestamp message from the server happens periodically
    // Reset the lastUser so that a name will always print after one of these
    Emitters.Timestamp = function (message, printer) {
        var dateDisplay = moment(message.createdAt.toString());
        lastUser = -1;
        printer((_.repeat(" ", 18) + dateDisplay.format('h:mm a')).grey);
    };

    // User posts a direct link to a tweet. This makes a sorta nicely formatted
    // Twitter message with a link to the original
    Emitters.Tweet = function (message, printer) {
        // body: 'I love code. -- @example, ' +
        //       'http://twitter.com/example/status/{id_number}'
        Helpers.withUser(message.userId, function (user) {
            var
                pattern = /^([\w\W]*)--\s?(@?\w*),?\s?(http?[\w\W]*)/m,
                tweetParts = pattern.exec(message.body),
                formattedMessage;

            formattedMessage = "" +
                (Formatters.userColumn(user.name) + ' shared a tweet: ').green +
                (Formatters.messageColumn(tweetParts[1], 32)).cyan + "\n" +
                _.repeat(" ", 32) +
                (tweetParts[2]).cyan + (" via Twitter").grey + "\n" +
                _.repeat(" ", 32) +
                 (tweetParts[3]).grey;

            printer(formattedMessage);
        });
    };

    // Any unknown message type is directed here.
    Emitters.Unknown = function (message, printer) {
        Emitters.Error(
            "Don't yet understand message of type: " + message.type,
            printer
        );
    };

    // User has uploaded a file. The Campfire API is broken on this.
    Emitters.Upload = function (message, printer) {
        Helpers.withUser(message.userId, function (user) {
            // The API doesn't provide a full URL. The workaround appears to be
            // polling a json endpoint for recent files and then constructing
            // a link
            printer(
                (Formatters.userColumn(user.name) +
                " uploaded an image: ").green +
                (message.body).cyan
            );
        });
    };

    // Return an ascii bell character if the message matches our alerts[]
    Formatters.appendAlert = function (messageBody) {

        var match = _.detect(config.alerts, function (alert) {
            // TODO: Add a check for a regular expression
            return _s.include(messageBody, alert);
        });

        if (!match) {
            return "";
        }

        // TODO: send message to tmux if available
        return "\007";
    };

    // Format the message column so that anything after the first
    // newline is indented by the columnWidth
    Formatters.messageColumn = function (messageBody, columnWidth) {
        if (!columnWidth) {
            columnWidth = config.leftColumn;
        }
        // These next two steps wrap it to the right hand width
        // and then add the left hand spacing to each line.
        messageBody = Formatters.wordWrap(
            messageBody,
            config.width - config.leftColumn,
            "\n",
            false
        );
        messageBody = messageBody
            .split("\n")
            .join("\n" + _.repeat(" ", config.leftColumn)
        );
        return messageBody;
    };

    // Truncate a name to fit in the left column and right justify it
    Formatters.userColumn = function (name) {
        name = name.substr(0, config.leftColumn - 2);
        name = _.lpad(name, config.leftColumn - 2, " ");
        return name;
    };

    Formatters.wordWrap = function (str, width, brk, cut) {
        var regex;
        brk = brk || '\n';
        width = width || 80;
        cut = cut || false;
        if (!str) { return str; }
        regex = '' +
            '.{1,' + width + '}(\\s|$)' +
            (cut ?
                '|.{' + width + '}|.+$' :
                '|\\S+?(\\s|$)'
            );
        return str.match(new RegExp(regex, 'g')).join(brk);
    };

    Commands.who = function (line) {
        console.log("Coming soon, waiting on patch to campfire class");
    };

    return {
        initialize: function (account, token, initOptions) {

            config = _.extend(defaultConfig, initOptions);

            // Initialize the Campfire object
            campfire = new Campfire({
                ssl: true,
                token: token,
                account: account
            });

            // Add our own name to the default alerts and save the result
            campfire.me(function (response, me) {
                var firstName = me.user.name.split(" ")[0];
                currentUser = me.user;
                config.alerts.push(firstName);
            });
        },

        join: function (roomid, alerts) {

            config.alerts = alerts;

            campfire.join(roomid, function (error, room) {
                if (error) {
                    Emitters.Error(error);
                    return;
                }

                // Save to the object
                currentRoomId = roomid;

                // For the recent messages, this weird recursion is necessary to
                // put them in order, due to the asynchronous nature of both
                // `console.log` and getting the user name.
                room.messages(function (error, messages) {
                    var next = function (body) {
                        console.log(body);
                        if (messages.length !== 0) {
                            Listeners.receiveMessage(messages.shift(), next);
                        }
                    };
                    next(
                        (_.repeat("=", config.width)).grey + "\n" +
                        (" Hi " + currentUser.name.split(" ")[0] +
                        ", welcome to campfire.").cyan + "\n" +
                        (_.repeat("=", config.width)).grey + "\n"
                    );
                });

                // Process a message as it comes in.
                room.listen(Listeners.receiveMessage);

                // Need a better REPL-like thing here, but at least this makes
                // it useable.
                cli.withInput(function (line, newline, eof) {
                    var cmd;

                    line = _.trim(line);

                    // Ignore empty lines
                    if (eof || line === "") {
                        return;
                    }

                    // If we're issuing a command, go to the command method.
                    // All commands start with a slash.
                    cmd = line.match(/(^\/)(\S+)/);
                    if (cmd && (cmd[1] === "/") &&
                        _.isFunction(Commands[cmd[2]])
                    ) {
                        Commands[cmd[2]](line);
                        return;
                    }

                    // Otherwise, we're sending a text message
                    room.message(line, "TextMessage");
                });
            });
        },

        leave: function () {
          // TODO: leave the room, perhaps on a /exit command
        }
    };
}());

// subdomain, roomid, token
if (cliOptions.s && cliOptions.r && cliOptions.t) {
    initOptions = {
        subdomain : cliOptions.s,
        roomid    : cliOptions.r,
        token     : cliOptions.t
    };
} else {
    // If they specified a config file on the command line via -f
    configFile = cliOptions.f ?
        cliOptions.f :
        process.env.HOME + '/.campfire.json';

    initOptions = JSON.parse(fs.readFileSync(configFile));

    // TODO: check that the file is valid
}

nodeTerm.initialize(initOptions.subdomain, initOptions.token, initOptions);
nodeTerm.join(initOptions.roomid, initOptions.alerts);

/* End of file nodeterm.js */
