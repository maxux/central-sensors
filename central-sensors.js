var sqlite3 = require('sqlite3').verbose();
var express = require('express');

//
// database
//
var db = new sqlite3.Database('sensors.sqlite3');

//
// console display
//
var devices = {
    "10-000802776315": "Living Room 1",
    "10-000802775cc7": "Living Room 2",
};

var sensors = {};
var last_refresh = 0;

function now(str) {
    return parseInt(Date.now() / 1000);
}

function strDate(timestamp) {
    var x = new Date(timestamp * 1000);
    return x.toISOString().slice(0, 19).replace("T", " ")
}

function printf(str, length) {
    process.stdout.write(str);

    if(str.length > length)
        return;

    for(var x = str.length; x < length; x++)
        process.stdout.write(" ");
}

function colorize(value) {
    if(value > 30)
        return "\033[1;31m";

    if(value > 20)
        return "\033[1;33m";

    if(value > 0)
        return "\033[1;32m";

    return "\033[1;34m";
}

function refresh() {
    // try to avoid concurrent update
    if(last_refresh == now())
        return;

    last_refresh = now();

    // clear screen
    console.log("\033[?25l\033[2J");

    if(Object.keys(sensors).length == 0) {
        console.log("Waiting for sensors");
        return;
    }

    // display sensors data
    for(var key in sensors) {
        var sensor = sensors[key];
        var device = key;

        if(devices[key])
            var device = devices[key];

        var date = strDate(sensor['timestamp']);

        printf(device, 16);
        printf(": ", 0)

        printf(colorize(sensor['value']));
        printf(sensor['value'] + "", 6);
        printf(" °C", 4);
        printf("\033[0m");

        printf("[" + date + "]\n", 0);
    }
}

//
// web service
//
var app = express();

app.get('/update/:device/:timestamp/:value', function (req, res) {
    sensors[req.params.device] = {
        "timestamp": req.params.timestamp,
        "value": (parseInt(req.params.value) / 1000).toFixed(2),
    };

    res.end()
    refresh();
});

//
// starting web service
//
app.listen(8081);

//
// init console
//
refresh()
