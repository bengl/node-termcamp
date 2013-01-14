# TermCamp

TermCamp is a command-line client for Campfire written in Node.js. 

## Installation

The quickest and most painless way to install TermCamp is to use npm:

    $ npm install -g termcamp

You can can also install from source by doing something like:

    $ git clone git://github.com/bengl/node-termcamp.git
    $ cd node-termcamp
    $ npm install -g .

## Usage

TermCamp requires a subdomain of campfirenow.com, a room id (the numeric one in
the URL) and an API token.  For example, if the URL for the room you want to use
is https://testing.campfirenow.com/room/12345 and your API token
is 1111111111111111111111, then you can use TermCamp like this:

    $ termcamp -s testing -r 12345 -t 1111111111111111111111

Alternatively you can create a JSON file that looks something like this:

    // example.json
    {
      "subdomain": "testing",
      "roomid": "12345",
      "token": "1111111111111111111111",
      "alerts": ["everybody", "anybody"]
    }

And then you can just do:

    $ termcamp -f example.json

To make this even easier, you can save this file in your home directory as 
`~/.campfire.json` and it will be used at lowest priority (so you can override
it with the options above).

Once started, TermCamp will show the recent message history from Campfire. You
can send messages to the room by just typing them and pressing Enter. Exit
with `Ctrl-C`.

## JSON Options

* `"rainbowNames": true` is an experimental option to give each user their own
  color. With the limited number of colors, it's not very practical.

## TODO and Ideas

* Regexp for alerts
* `tput cols` for width on startup via 'auto' in json config
* Figure out why the bell isn't sounding in appendAlert
* Change line backgrond color for alert text
* Clear text when we've posted so we don't see it twice
* Emoji to ascii art or unicode
* Support for pasting?
* Support for `/me` and `/afk` style messages
* Support for `/play` sending messages
* Support for `/topic` setting of topic
* Support for `/who` to list current user. Needs campfire patch.
* Submit patch to the campfire class to support users in rooms
* Show room topic when logging in
* Tab autocomplete names if possible
* Config option to allow Growl messages on alert
* Turn the sounds into a funny message:
    - _John Smith is taking the highway to the danger zone_
    - _Eric Williams is looking for Bueller, Bueller?_

## License

[MIT License](./LICENSE.txt)
