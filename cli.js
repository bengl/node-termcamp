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
	if (users[id]) callback(users[id]);
	else
		fire.user(id,function(error,user){
			if (error) console.log(error);
			else callback(users[id] = user.user);
		});
};

// Calls the callback with a console-formatted version of the message from API.
putMessage = function(message,callback){
	var left = false;
	switch (message.type) {
		case "TimestampMessage":
			callback(message.createdAt.toString().blue);
			break;
		case "KickMessage":
			// For now deal with it like a LeaveMessage. Campfire seems to do the same.
		case "LeaveMessage":
			left = true;
		case "EnterMessage":
			doUser(message.userId,function(user){
				callback(('* '+user.name).green+(' has '+(left?'left':'entered')+' the room.').magenta);
			});
			break;
		case "TextMessage":
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
	var opts;
	if (options.f) opts = JSON.parse(fs.readFileSync(options.f));
	else opts = JSON.parse(fs.readFileSync(process.env.HOME+'/.campfire.json'));
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
		var i = -1;
		var next = function(body){
			if (i < messages.length) console.log(body);
			if (++i != messages.length) putMessage(messages[i],next);
		}
		putMessage(messages[0],next);
	});

	room.listen(function(message){putMessage(message,console.log)});

	// Need a better REPL-like thing here, but at least this makes it useable.
	cli.withInput(function(line, newline, eof){
		if (!eof && line != "") room.message(line,'TextMessage');
	});
});
