let ipc = require('electron').ipcRenderer;

window.jQuery = $ = require('jquery');

let channel = require(__dirname + '/channel.json');

let configuration_json = require(__dirname + '/configuration.json');

function openFileSelectionDialog(targetInput){

    let tempFileInput = $('<input type="file" />');

    tempFileInput.change(function(){
        let selected_file_path = tempFileInput[0].files[0].path;
        targetInput.val(selected_file_path);
    });

    tempFileInput.click();
}

function loadConfiguration() {
    $('#smc-ip-input').val(configuration_json['smc_ip']);
    $('#username-input').val(configuration_json['username']);
    $('#password-input').val(configuration_json['password']);
    $('#jre-path-input').val(configuration_json['jre_path']);
    $('#smcipmitool-jar-path-input').val(configuration_json['smcipmitool_jar_path']);
    $('#ipmitool-path-input').val(configuration_json['ipmitool_path']);
}

window.onload = function () {

    $('#fan-mode-control-content .checkbox').checkbox({

        onChecked: function () {

            let code = this.value.split('|');

            if (code[0] === "PrecisionControl") {

                $("#cpu-fan-input").prop('disabled', false).click();
                $("#peripheral-fan-input").prop('disabled', false).click();

                return;

            } else {

                $("#cpu-fan-input").prop('disabled', true);
                $("#peripheral-fan-input").prop('disabled', true);

            }

            ipc.once(channel['fan_mode_channel'] + '-FEEDBACK', function (event, feedback) {
                console.log(feedback);
            });

            ipc.send(channel['fan_mode_channel'], {

                'redfish_code': code[0],
                'smcipmitool_code': code[1],
                'ipmitool_code': code[2]

            });

        }

    });

    $('#reset-option-content .checkbox').checkbox({

        onChecked: function () {

            $("#reset-option-input").val(this.value);

            if (this.value.split('|')[0] === "Cycle") {
                $("#cycle-interval").removeClass("disabled");
            } else {
                $("#cycle-interval").addClass("disabled");
            }

        }

    });

    $('#cpu-fan-input').click(function () {

        let code = this.placeholder.split('|');

        ipc.once(channel['fan_precision_control'] +'-FEEDBACK', function (event, feedback) {
            console.log(feedback);
        });

        ipc.send(channel['fan_precision_control'], {
            'smcipmitool_code': code[0],
            'ipmitool_code': code[1],
            'speed_code': this.value
        });

    });

    $('#peripheral-fan-input').click(function () {

        let code = this.placeholder.split('|');

        ipc.once(channel['fan_precision_control'] + '-FEEDBACK', function (event, feedback) {
            console.log(feedback);
        });

        ipc.send(channel['fan_precision_control'], {
            'smcipmitool_code': code[0],
            'ipmitool_code': code[1],
            'speed_code': this.value
        });

    });

    $("#configuration-button").click(function () {

        $('#configuration-panel').modal('show');

    });

    $("#jre-path-select-button").click(function () {
        openFileSelectionDialog($('#jre-path-input'));
    });

    $("#smcipmitool-jar-path-select-button").click(function () {
        openFileSelectionDialog($('#smcipmitool-jar-path-input'));
    });

    $("#ipmitool-path-select-button").click(function () {
        openFileSelectionDialog($('#ipmitool-path-input'));
    });

    $("#configuration-save-button").click(function () {

        $('#configuration-panel').modal('hide');

        ipc.once(channel['configuration_channel'] +'-FEEDBACK', function (event, feedback) {
            loadConfiguration();
        });

        ipc.send(channel['configuration_channel'], {
            "smc_ip": $('#smc-ip-input').val(),
            "username": $('#username-input').val(),
            "password": $('#password-input').val(),
            "jre_path": $('#jre-path-input').val(),
            "smcipmitool_jar_path": $('#smcipmitool-jar-path-input').val(),
            "ipmitool_path": $('#ipmitool-path-input').val()
        })
    });

    $("#reset-execute-button").click(function () {

        let resetCode = $("#reset-option-input").val().split('|');
        let bootOverrideOptionCode = $("#boot-override-option-input").val().split('|');
        let cycleInterval = $("#cycle-interval-input").val();
        let overrideOnce = $("#boot-source-override-once-checkbox")[0].checked;

        // console.log(resetCode);
        // console.log(bootOverrideOptionCode);
        // console.log(cycleInterval);
        // console.log(overrideOnce);

        ipc.send(channel['reset-boot-control'], {
            'redfish_reset_code': resetCode[0],
            'ipmitool_reset_code': resetCode[1],
            'smcipmitool_reset_code': resetCode[2],
            'cycle_interval': cycleInterval,
            'redfish_boot_override_code': bootOverrideOptionCode[0],
            'ipmitool_boot_override_code': bootOverrideOptionCode[1],
            'smcipmitool_boot_override_code': bootOverrideOptionCode[2],
            'override_once': overrideOnce
        });
    })

    loadConfiguration();

    $("select.dropdown").dropdown();
    $(".ui.dropdown").dropdown();

}



