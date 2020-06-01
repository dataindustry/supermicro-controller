'use strict'

const {app, BrowserWindow} = require('electron');
const https = require('https');
const ipcMain = require('electron').ipcMain;
const fs = require("fs");
const nodeCmd = require('node-cmd');
let channel = require(__dirname + '/channel.json');

const redfish_api_prefix = '/redfish/v1';

let configuration_json = require(__dirname + '/configuration.json');

let win;

let smc_ip = '';
let username = '';
let password = '';
let jre_path = '';
let smcipmitool_jar_path = '';
let ipmitool_path = '';

let is_redfish_ready = true;
let is_smcipmitool_ready = true;
let is_ipmitool_ready = true;

let x_auth_token = '';
let session_id = '';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

function buildSmcimpitoolCommand(command) {
    return jre_path + ' -jar ' + smcipmitool_jar_path + ' ' + smc_ip + ' ' + username + ' ' + password + ' ' + command;
}

function buildImpitoolCommand(command) {
    return ipmitool_path + ' -H ' + smc_ip + ' -U ' + username + ' -P ' + password + ' ' + command;
}

function runCommand(command, event, feedbackChannel){

    console.log(command);

    nodeCmd.get(
        command,
        function (err, data, stderr) {
            event.sender.send(feedbackChannel, data);
        }
    );
}

function isLogicEmptyString(targetString) {
    return isLogicEmptyObject(targetString) || targetString.trim() === "";
}

function isLogicEmptyObject(targetString) {
    return targetString === undefined || targetString === null;
}

function createWindow(event) {

    win = new BrowserWindow({
        width: 780,
        height: 740,
        transparent: false,
        frame: true,
        webPreferences: {
            nodeIntegration: true
        }
    })

    win.loadFile('index.html').then(r => null);

    // win.webContents.openDevTools();

    smc_ip = configuration_json['smc_ip'];
    username = configuration_json['username'];
    password = configuration_json['password'];
    jre_path = configuration_json['jre_path'];
    smcipmitool_jar_path = configuration_json['smcipmitool_jar_path'];
    ipmitool_path = configuration_json['ipmitool_path'];

    is_redfish_ready = !(isLogicEmptyString(smc_ip) || isLogicEmptyString(username) || isLogicEmptyString(password));
    is_smcipmitool_ready = !(isLogicEmptyString(jre_path) || isLogicEmptyString(smcipmitool_jar_path));
    is_ipmitool_ready = !isLogicEmptyString(ipmitool_path);

    redfish_login();

}

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit()
    }
})

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow()
    }
})

ipcMain.on(channel['fan_mode_channel'], function (event, code) {

    console.log(code);

    if (is_redfish_ready === true && !isLogicEmptyString(code["redfish_code"])) {

        let patch_data = JSON.stringify({
            "Mode": code["redfish_code"]
        });

        redfish_post_or_patch(
            redfish_api_prefix + '/Managers/1/FanMode',
            'PATCH',
            patch_data,
            event,
            channel['fan_mode_channel'] + '-FEEDBACK');

    }

    if (is_smcipmitool_ready === true && !isLogicEmptyString(code["smcipmitool_code"])) {
        let command = 'ipmi raw 30 45 01 ' + code["smcipmitool_code"];
        runCommand(buildSmcimpitoolCommand(command), event, channel['fan_mode_channel'] + '-FEEDBACK');
    }

    if (is_ipmitool_ready === true && !isLogicEmptyString(code["ipmitool_code"])) {
        let command = 'raw 0x30 0x45 0x01 ' + code["ipmitool_code"];
        runCommand(buildImpitoolCommand(command), event, channel['fan_mode_channel'] + '-FEEDBACK');
    }

});

ipcMain.on(channel['fan_precision_control'], function (event, code) {

    console.log(code);

    if (is_redfish_ready === true) {
        console.log('not supported.')
    }

    if (is_smcipmitool_ready === true && !isLogicEmptyString(code["smcipmitool_code"])) {
        let command = 'ipmi raw 30 70 66 01 ' + code['smcipmitool_code'] + ' ' + code['speed_code'];
        runCommand(buildSmcimpitoolCommand(command), event, channel['fan_precision_control'] + '-FEEDBACK');
    }

    if (is_ipmitool_ready === true && !isLogicEmptyString(code["ipmitool_code"])) {
        let command = 'raw 0x30 0x70 0x66 0x01 0x' + code['ipmitool_code'] + ' 0x' + code['speed_code'];
        runCommand(buildImpitoolCommand(command), event, channel['fan_precision_control'] + '-FEEDBACK');
    }

});

ipcMain.on(channel['configuration_channel'], function (event, configuration) {

    console.log(configuration);

    smc_ip = configuration['smc_ip'];
    username = configuration['username'];
    password = configuration['password'];
    jre_path = configuration['jre_path'];
    smcipmitool_jar_path = configuration['smcipmitool_jar_path'];
    ipmitool_path = configuration['ipmitool_path'];

    is_redfish_ready = !(isLogicEmptyString(smc_ip) || isLogicEmptyString(username) || isLogicEmptyString(password));
    is_smcipmitool_ready = !(isLogicEmptyString(jre_path) || isLogicEmptyString(smcipmitool_jar_path));
    is_ipmitool_ready = !isLogicEmptyString(ipmitool_path);

    fs.writeFile(__dirname + "/configuration.json", JSON.stringify(
        {
            "smc_ip": smc_ip,
            "username": username,
            "password": password,
            "jre_path": jre_path,
            "smcipmitool_jar_path": smcipmitool_jar_path,
            "ipmitool_path": ipmitool_path
        }),
        function (err) {
            if (err) {
                console.log(err);
            }
        });

    configuration_json = require(__dirname + '/configuration.json');

    event.sender.send(channel['fan_mode_channel'] + '-FEEDBACK');

    redfish_login(event);

});

ipcMain.on(channel['reset-boot-control'], function (event, code) {

    console.log(code);

    // boot override option
    if (is_redfish_ready === true && !isLogicEmptyString(code["redfish_boot_override_code"])) {

        let patch_data_object = {
            "BootSourceOverrideTarget": code["redfish_boot_override_code"]
        }

        if (code["override_once"]) {
            patch_data_object["BootSourceOverrideEnabled"] = "Once";
        }

        redfish_post_or_patch(
            redfish_api_prefix + '/Systems/1',
            'PATCH',
            JSON.stringify(patch_data_object),
            event,
            channel['reset-boot-control'] + '-FEEDBACK');
    }

    if (is_smcipmitool_ready === true && !isLogicEmptyString(code["smcipmitool_boot_override_code"])) {
        let command = 'ipmi power bootoption ' + code["smcipmitool_boot_override_code"];
        runCommand(buildSmcimpitoolCommand(command), event, channel['reset-boot-control'] + '-FEEDBACK');
    }

    if (is_ipmitool_ready === true && !isLogicEmptyString(code["ipmitool_boot_override_code"])) {
        let command = 'chassis bootdev ' + code["ipmitool_boot_override_code"];
        runCommand(buildImpitoolCommand(command), event, channel['reset-boot-control'] + '-FEEDBACK');
    }

    // reset option
    if(!isLogicEmptyString(code["cycle_interval"])){
        if (is_smcipmitool_ready === true && !isLogicEmptyString(code["smcipmitool_reset_code"])) {
            let command = 'ipmi power ' + code["smcipmitool_reset_code"] + ' ' + code["cycle_interval"];
            runCommand(buildSmcimpitoolCommand(command), event, channel['reset-boot-control'] + '-FEEDBACK');
        }
    }

    if (is_redfish_ready === true && !isLogicEmptyString(code["redfish_reset_code"])) {
        let patch_data = JSON.stringify({
            "ResetType": code["redfish_reset_code"]
        });

        redfish_post_or_patch(
            redfish_api_prefix + '/Systems/1/Actions/ComputerSystem.Reset',
            'POST',
            patch_data,
            event,
            channel['reset-boot-control'] + '-FEEDBACK');
    }

    if (is_smcipmitool_ready === true && !isLogicEmptyString(code["smcipmitool_reset_code"])) {
        let command = 'ipmi power ' + code["smcipmitool_reset_code"];
        runCommand(buildSmcimpitoolCommand(command), event, channel['reset-boot-control'] + '-FEEDBACK');
    }

    if (is_ipmitool_ready === true && !isLogicEmptyString(code["ipmitool_reset_code"])) {
        let command = 'power ' + code["ipmitool_reset_code"];
        runCommand(buildImpitoolCommand(command), event, channel['reset-boot-control'] + '-FEEDBACK');
    }

});

function redfish_login(event) {

    let authentication_data = JSON.stringify({
        'UserName': username,
        'Password': password
    });

    let req = https.request({
        host: smc_ip,
        port: 443,
        path: redfish_api_prefix + '/SessionService/Sessions',
        method: 'POST',
        headers: {
            'Content-Length': authentication_data.length
        }

    }, function (res) {

        let body = '';

        res.on('data', function (chunk) {
            body = body + chunk;
        });

        res.on('end', function () {
            session_id = res.headers['Id'];
            x_auth_token = res.headers['x-auth-token'];
        });

    });

    req.write(authentication_data);
    req.end();

}

function redfish_post_or_patch(path, method, patch_data, event, feedbackChannel) {

    let req = https.request({
        host: smc_ip,
        port: 443,
        path: path,
        method: method,
        headers: {
            'X-Auth-Token': x_auth_token,
            'Content-Length': patch_data.length
        }

    }, function (res) {

        let body = '';

        res.on('data', function (chunk) {
            body = body + chunk;
        });

        res.on('end', function () {
            event.sender.send(feedbackChannel, body);
        });

    });

    req.write(patch_data);
    req.end();

}
