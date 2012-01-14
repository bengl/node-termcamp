#!/usr/bin/env node

var Campfire = require('campfire').Campfire,
    cli = require('cli'),
    options = cli.parse(),
    fs = require('fs'),
    colors = require('colors'),
    username, roomid, token, users = {},
    fire, doUser, putMessage;

// Gets a user by id (either from memory or API) and calls the callback with the user.
doUser = function(id,callback){
  if (users[id])
    callback(users[id]);
  else
    fire.user(id,function(error,user){
      if (error)
        console.log(error);
      else
        callback(users[id] = user.user);
    });
};

// Calls the callback with a console-formatted version of the message from API.
putMessage = function(message,callback){
  var left = false;
  callback = callback ? callback : console.log;
  switch (message.type.replace(/Message/,'') {
    case "Timestamp":
      callback(message.createdAt.toString().blue);
      break;
    case "Kick":
      // For now deal with it like a LeaveMessage. Campfire seems to do the same.
    case "Leave":
      left = true;
    case "Enter":
      doUser(message.userId,function(user){
        callback(('* '+user.name).green+(' has '+(left?'left':'entered')+' the room.').magenta);
      });
      break;
    case "Text":
      doUser(message.userId,function(user){
        callback((user.name+': ').green+message.body.white.bold);
      });
      break;
    default:
      callback(("Don't yet understand message of type: "+message.type).red);
  }
};

if (options.u && options.r && options.t) {
  account = options.s;
  roomid = options.r;
  token = options.t;
} else {
  var file = options.f ? options.f : process.env.HOME+'/.campfire.json',
      opts = JSON.parse(fs.readFileSync(file));
  account = opts.subdomain;
  roomid = opts.roomid;
  token = opts.token;
}

fire = new Campfire({
  ssl:true,
  token:token,
  account:account
});

fire.join(roomid,function(error,room){
  if (error) {
    console.log(error);
    return;
  }

  // For the recent messages, this weird recursion is necessary to put them in order, due to the
  // asynchronous nature of both console.log and getting the user name.
  room.messages(function(error,messages){
    var next = function(body){
      console.log(body);
      if (messages.length != 0)
        putMessage(messages.shift(),next);
    }
    next("Starting...");
  });

  room.listen(putMessage);

  // Need a better REPL-like thing here, but at least this makes it useable.
  cli.withInput(function(line, newline, eof){
    if (!eof && line != "")
      room.message(line,'TextMessage');
  });
});
