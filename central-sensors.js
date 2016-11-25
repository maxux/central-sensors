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
    "default": {
        'name': "(default)",
        'limits': {'high': 30, 'warn': 20, 'normal': 10, 'low': 0},
    },
    "10-000802776315": {
        'name': "Living Room 1",
        'limits': {'high': 31, 'warn': 26, 'normal': 23, 'low': 21},
    },
    "10-000802775cc7": {
        'name': "Living Room 2",
        'limits': {'high': 31, 'warn': 26, 'normal': 23, 'low': 21},
    },
    "28-0316454327ff": {
        'name': "Freezer",
        'limits': {'high': -14, 'warn': -18, 'normal': -26, 'low': -32},
    },
    "28-03164756d6ff": {
        'name': "Fridge",
        'limits': {'high': 9, 'warn': 5.5, 'normal': 2, 'low': 1},
    },
    "28-031644fec5ff": {
        'name': "Kitchen Room",
        'limits': {'high': 28, 'warn': 25, 'normal': 18, 'low': 15},
    },
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

function colorize(value, limits) {
    if(value > limits['high'])
        return "\033[1;31m";

    if(value > limits['warn'])
        return "\033[1;33m";

    if(value > limits['normal'])
        return "\033[1;32m";

    if(value > limits['low'])
        return "\033[1;34m";

    // unknown
    return "\033[1;36m";
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
        var limits = devices['default']['limits'];

        if(devices[key]) {
            device = devices[key]['name'];
            limits = devices[key]['limits'];
        }

        var date = strDate(sensor['timestamp']);

        printf(device, 16);
        printf(": ", 0)

        printf(colorize(sensor['value'], limits));
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

app.get('/current', function (req, res) {
    var data = {};

    for(var key in sensors) {
        var device = key;
        var limits = devices['default']['limits'];

        if(devices[key]) {
            device = devices[key]['name'];
            limits = devices[key]['limits'];
        }

        data[device] = {
            'name': device,
            'limits': limits,
        };
    }

    res.type('json');
    res.send(JSON.stringify(data));
    res.end()
});

//
// starting web service
//
app.listen(8081);

//
// init console
//
refresh()
