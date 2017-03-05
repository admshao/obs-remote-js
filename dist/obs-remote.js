/*!
 * OBS Remote JS API v1.2.0 (https://github.com/admshao/obs-remote-js)
 * Copyright 2017 Fabio Madia <admshao@gmail.com>
 * Licensed under  ()
 */
(function() {
    'use strict';

    function OBSSource(param) {
        var self = this;
        this.name = param.name || '';
        this.type = param.type || OBSSource.TYPE.INPUT;
        if (param.filters && param.filters.length > 0) {
            this.filters = [];
            param.filters.forEach(function (filter) {
                self.filters.push(new OBSSource(filter));
            });
        }
    }

    OBSSource.TYPE = Object.freeze({INPUT: 0, FILTER: 1, TRANSITION: 2, SCENE: 3});

    if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
        module.exports.OBSSource = OBSSource;
    } else {
        window.OBSSource = OBSSource;
    }
})();

(function () {
    'use strict';

    function OBSScene(name, sources) {
        var self = this;
        this.name = name || '';
        this.sources = [];
        this.filters = [];
        sources.forEach(function (source) {
            switch (source.type) {
                case OBSSource.TYPE.INPUT:
                    self.sources.push(source);
                    break;
                case OBSSource.TYPE.FILTER:
                    self.filters.push(source);
                    break;
                default:
                    break;
            }
        });

    }

    if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
        module.exports.OBSScene = OBSScene;
    } else {
        window.OBSScene = OBSScene;
    }
})();

(function () {
    'use strict';

    var OBSSource = {};
    var OBSScene = {};

    if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
        OBSScene = module.exports.OBSScene;
        OBSSource = module.exports.OBSSource;
    } else {
        OBSScene = window.OBSScene;
        OBSSource = window.OBSSource;
    }

    function OBSRemote(debug) {
        OBSRemote.API_VERSION = 1.2;
        OBSRemote.DEFAULT_PORT = 4444;
        OBSRemote.WS_PROTOCOL = 'obsapi';
        OBSRemote.MAX_MSG_ID = 4294967295; // Math.pow(2,32) - 1

        this._debug = debug || false;
        this._connected = false;
        this._socket = undefined;
        this._messageCounter = 0;
        this._responseCallbacks = {};

        this._auth = {salt: '', challenge: ''};
    }

    // IE11 crypto object is prefixed
    var crypto = {};
    var WebSocket = {};

    OBSRemote.prototype._webCryptoHash = function (pass, callback) {
        var utf8Pass = _encodeStringAsUTF8(pass);
        var utf8Salt = _encodeStringAsUTF8(this._auth.salt);

        var ab1 = _stringToArrayBuffer(utf8Pass + utf8Salt);

        var self = this;
        crypto.subtle.digest('SHA-256', ab1)
            .then(function (authHash) {
                var utf8AuthHash = _encodeStringAsUTF8(_arrayBufferToBase64(authHash));
                var utf8Challenge = _encodeStringAsUTF8(self._auth.challenge);

                var ab2 = _stringToArrayBuffer(utf8AuthHash + utf8Challenge);

                crypto.subtle.digest('SHA-256', ab2)
                    .then(function (authResp) {
                        var authRespB64 = _arrayBufferToBase64(authResp);
                        callback(authRespB64);
                    });
            });
    };

    OBSRemote.prototype._cryptoJSHash = function (pass, callback) {
        var utf8Pass = _encodeStringAsUTF8(pass);
        var utf8Salt = _encodeStringAsUTF8(this._auth.salt);

        var authHash = CryptoJS.SHA256(utf8Pass + utf8Salt).toString(CryptoJS.enc.Base64);

        var utf8AuthHash = _encodeStringAsUTF8(authHash);
        var utf8Challenge = _encodeStringAsUTF8(this._auth.challenge);

        var authResp = CryptoJS.SHA256(utf8AuthHash + utf8Challenge).toString(CryptoJS.enc.Base64);

        callback(authResp);
    };

    OBSRemote.prototype._nodeCryptoHash = function (pass, callback) {
        var authHasher = crypto.createHash('sha256');

        var utf8Pass = _encodeStringAsUTF8(pass);
        var utf8Salt = _encodeStringAsUTF8(this._auth.salt);

        authHasher.update(utf8Pass + utf8Salt);
        var authHash = authHasher.digest('base64');

        var respHasher = crypto.createHash('sha256');

        var utf8AuthHash = _encodeStringAsUTF8(authHash);
        var utf8Challenge = _encodeStringAsUTF8(this._auth.challenge);

        respHasher.update(utf8AuthHash + utf8Challenge);
        var respHash = respHasher.digest('base64');

        callback(respHash);
    };

    function _encodeStringAsUTF8(string) {
        return unescape(encodeURIComponent(string)); //jshint ignore:line
    }

    function _stringToArrayBuffer(string) {
        var ret = new Uint8Array(string.length);
        for (var i = 0; i < string.length; i++) {
            ret[i] = string.charCodeAt(i);
        }
        return ret.buffer;
    }

    function _arrayBufferToBase64(arrayBuffer) {
        var binary = '';
        var bytes = new Uint8Array(arrayBuffer);

        var length = bytes.byteLength;
        for (var i = 0; i < length; i++) {
            binary += String.fromCharCode(bytes[i]);
        }

        return btoa(binary);
    }

    if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
        crypto = require('crypto');
        OBSRemote.prototype._authHash = OBSRemote.prototype._nodeCryptoHash;

        WebSocket = require('ws');
    } else {
        crypto = window.crypto || window.msCrypto || {};
        OBSRemote.prototype._authHash = OBSRemote.prototype._webCryptoHash;

        if (typeof crypto.subtle === 'undefined') {
            // Safari crypto.subtle is prefixed, all other browsers use subtle or don't implement
            if (typeof crypto.webkitSubtle === 'undefined') {
                // Native crypto not available, fall back to CryptoJS
                if (typeof CryptoJS === 'undefined') {
                    throw new Error('OBS Remote requires CryptoJS when native crypto is not available!');
                }

                OBSRemote.prototype._authHash = OBSRemote.prototype._cryptoJSHash;
            } else {
                crypto.subtle = crypto.webkitSubtle;
            }
        }

        WebSocket = window.WebSocket;
    }

    /**
     * Try to connect to OBS, with optional password
     * @param address "ipAddress" or "ipAddress:port"
     *        defaults to "localhost"
     * @param password Optional authentication password
     */
    OBSRemote.prototype.connect = function (address, password) {
        // Password is optional, set to empty string if undefined
        password = (typeof password === 'undefined') ?
            '' :
            password;

        // Check for address
        address = (typeof address === 'undefined' || address === '') ?
            'localhost' :
            address;

        // Check for port number, if missing use 4444
        var colonIndex = address.indexOf(':');
        if (colonIndex < 0 || colonIndex === address.length - 1) {
            address += ':' + OBSRemote.DEFAULT_PORT;
        }

        // Check if we already have a connection
        if (this._connected) {
            this._socket.close();
            this._connected = false;
        }

        // Connect and setup WebSocket callbacks
        if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
            this._socket = new WebSocket('ws://' + address, {protocol: OBSRemote.WS_PROTOCOL});
        } else {
            this._socket = new WebSocket('ws://' + address, OBSRemote.WS_PROTOCOL);
        }

        var self = this;

        this._socket.onopen = function () {
            self._connected = true;

            self.isAuthRequired(function (required) {
                self.onConnectionOpened(required);
                if (!required) return;

                self.authenticate(password);
            });
        };

        this._socket.onclose = function () {
            if (self._connected) {
                self.onConnectionClosed();
            }
            self._connected = false;
        };

        this._socket.onerror = function (event) {
            self.onConnectionFailed(event);
            self._connected = false;
        };

        this._socket.onmessage = function (message) {
            self._messageReceived(message);
        };
    };

    /**
     * Attempts to authenticate with OBS
     * Will cause either onAuthenticationFailed or onAuthenticationSucceeded to be called
     * @param password the password to try authenticating with
     */
    OBSRemote.prototype.authenticate = function (password) {
        var self = this;
        this._authHash(password, function (authResp) {

            function cb(message) {
                var successful = (message.status === 'ok');
                var remainingAttempts = 0;

                if (!successful) {
                    // eugh
                    remainingAttempts = message.error.substr(43);

                    self.onAuthenticationFailed(remainingAttempts);
                } else {
                    self.onAuthenticationSucceeded();
                }
            }

            self._sendMessage('Authenticate', {
                'auth': authResp
            }, cb);
        });
    };

    /**
     * Starts or stops OBS from streaming, recording, or previewing.
     * Result of this will be either the onStreamStarted or onStreamStopped callback.
     * @param previewOnly Only toggle the preview
     */
    OBSRemote.prototype.toggleStream = function (previewOnly) {
        // previewOnly is optional, default to false
        previewOnly = (typeof previewOnly === 'undefined') ?
            false :
            previewOnly;

        this._sendMessage('StartStopStreaming', {
            'preview-only': previewOnly
        });
    };

    /**
     * Requests OBS Remote version
     * @param callback function(Number version)
     */
    OBSRemote.prototype.getVersion = function (callback) {
        function cb(message) {
            callback(message.version);
        }

        this._sendMessage('GetVersion', cb);
    };

    /**
     * Checks if authentication is required
     * @param callback function(Boolean isRequired)
     */
    OBSRemote.prototype.isAuthRequired = function (callback) {
        var self = this;

        function cb(message) {
            var authRequired = message.authRequired;

            if (authRequired) {
                self._auth.salt = message.salt;
                self._auth.challenge = message.challenge;
            }

            callback(authRequired);
        }

        this._sendMessage('GetAuthRequired', cb);
    };

    /**
     * Gets name of current scene and full list of all other scenes
     * @param callback function(String currentScene, Array scenes)
     */
    OBSRemote.prototype.getSceneList = function (callback) {
        function cb(message) {
            var currentScene = message['current-scene'];
            var scenes = [];

            message.scenes.forEach(function (scene) {
                scenes.push(_convertToOBSScene(scene));
            });

            callback(currentScene, scenes);
        }

        this._sendMessage('GetSceneList', cb);
    };

    /**
     * Gets name of current scene and full list of all other scenes names
     * @param callback function(String currentScene, Array scenes)
     */
    OBSRemote.prototype.getSceneNames = function (callback) {
        function cb(message) {
            var names = [];

            message.scenes.forEach(function (scene) {
                names.push(scene.name);
            });

            callback(names);
        }

        this._sendMessage('GetSceneNames', cb);
    };

    /**
     * Gets the current scene and full list of sources
     * @param callback function(OBSScene scene)
     */
    OBSRemote.prototype.getCurrentScene = function (callback) {
        function cb(message) {
            var obsScene = _convertToOBSScene(message);

            callback(obsScene);
        }

        this._sendMessage('GetCurrentScene', cb);
    };

    /**
     * Tells OBS to switch to the given scene name
     * If successful onSceneSwitched will be called
     * @param sceneName name of scene to switch to
     */
    OBSRemote.prototype.setCurrentScene = function (sceneName) {
        this._sendMessage('SetCurrentScene', {
            'scene-name': sceneName
        });
    };

    /**
     * Reorders sources in the current scene
     * @param sources Array of Strings, or OBSSources
     */
    OBSRemote.prototype.setSourcesOrder = function (sources) {
        var sourceNames = sources;

        // Support Array[OBSSource] for convenience
        if (sources[1] instanceof 'OBSSource') {
            sourceNames = [];
            sources.forEach(function (source) {
                sourceNames.push(source.name);
            });
        }

        this._sendMessage('SetSourcesOrder', {
            'scene-names': sourceNames
        });
    };

    /**
     * Sets a source's render state in the current scene
     * @param sourceName
     * @param shouldRender
     */
    OBSRemote.prototype.setSourceRender = function (sourceName, shouldRender) {
        this._sendMessage('SetSourceRender', {
            source: sourceName,
            render: shouldRender
        });
    };

    /**
     * Gets current streaming status, and if we're previewing or not
     * @param callback function(Boolean streaming, Boolean previewOnly)
     */
    OBSRemote.prototype.getStreamingStatus = function (callback) {
        function cb(message) {
            callback(message.streaming, message['preview-only']);
        }

        this._sendMessage('GetStreamingStatus', cb);
    };

    /**
     * Gets current volume levels and mute statuses
     * @param callback function(Number microphoneVolume, Boolean microphoneMuted, Number desktopVolume, Boolean desktop)
     */
    OBSRemote.prototype.getVolumes = function (callback) {
        function cb(message) {
            callback(message['mic-volume'], message['mic-muted'], message['desktop-volume'], message['desktop-muted']);
        }

        this._sendMessage('GetVolumes', cb);
    };

    /**
     * Sets microphone volume, and whether we're still adjusting it
     * @param volume
     * @param adjusting Optional, defaults to false
     */
    OBSRemote.prototype.setMicrophoneVolume = function (volume, adjusting) {
        this._sendMessage('SetVolume', {
            channel: 'microphone',
            volume: volume,
            final: !adjusting
        });
    };

    /**
     * Toggles microphone mute state
     */
    OBSRemote.prototype.toggleMicrophoneMute = function () {
        this._sendMessage('ToggleMute', {
            channel: 'microphone'
        });
    };

    /**
     * Sets desktop volume, and whether we're still adjusting it
     * @param volume
     * @param adjusting Optional, defaults to false
     */
    OBSRemote.prototype.setDesktopVolume = function (volume, adjusting) {
        this._sendMessage('SetVolume', {
            channel: 'desktop',
            volume: volume,
            final: !adjusting
        });
    };

    /**
     * Toggles desktop mute state
     */
    OBSRemote.prototype.toggleDesktopMute = function () {
        this._sendMessage('ToggleMute', {
            channel: 'desktop'
        });
    };

    /**
     * OBSRemote API callbacks
     */

    /* jshint ignore:start */

    /**
     * Called when the connection to OBS is made
     * You may still need to authenticate!
     */
    OBSRemote.prototype.onConnectionOpened = function () {
    };

    /**
     * Called when the connection to OBS is closed
     */
    OBSRemote.prototype.onConnectionClosed = function () {
    };

    /**
     * Called when the connection to OBS fails
     */
    OBSRemote.prototype.onConnectionFailed = function () {
    };

    /**
     * Called when authentication is successful
     */
    OBSRemote.prototype.onAuthenticationSucceeded = function () {
    };

    /**
     * Called when authentication fails
     * @param remainingAttempts how many more attempts can be made
     */
    OBSRemote.prototype.onAuthenticationFailed = function (remainingAttempts) {
    };

    /**
     * OBS standard callbacks
     */

    /**
     * Called when OBS starts streaming, recording or previewing
     * @param previewing are we previewing or 'LIVE'
     */
    OBSRemote.prototype.onStreamStarted = function (previewing) {
    };

    /**
     * Called when OBS stops streaming, recording or previewing
     * @param previewing were we previewing, or 'LIVE'
     */
    OBSRemote.prototype.onStreamStopped = function (previewing) {
    };

    /**
     * Called frequently by OBS while live or previewing
     * @param streaming are we streaming (or recording)
     * @param previewing are we previewing or live
     * @param bytesPerSecond
     * @param strain
     * @param streamDurationInMS
     * @param totalFrames
     * @param droppedFrames
     * @param framesPerSecond
     */
    OBSRemote.prototype.onStatusUpdate = function (streaming, previewing, bytesPerSecond, strain, streamDurationInMS,
                                                   totalFrames, droppedFrames, framesPerSecond) {
    };

    /**
     * Called when OBS switches scene
     * @param sceneName scene OBS has switched to
     */
    OBSRemote.prototype.onSceneSwitched = function (sceneName) {
    };

    /**
     * Called when the scene list changes (new order, addition, removal or renaming)
     * @param scenes new list of scenes
     */
    OBSRemote.prototype.onScenesChanged = function (scenes) {
    };

    /**
     * Called when source oder changes in the current scene
     * @param sources
     */
    OBSRemote.prototype.onSourceOrderChanged = function (sources) {
    };

    /**
     * Called when a source is added or removed from the current scene
     * @param sources
     */
    OBSRemote.prototype.onSourceAddedOrRemoved = function (sources) {
    };

    /**
     * Called when a source in the current scene changes
     * @param originalName if the name changed, this is what it was originally
     * @param source
     */
    OBSRemote.prototype.onSourceChanged = function (originalName, source) {
    };

    /**
     * Called when the microphone volume changes, or is muted
     * @param volume
     * @param muted
     * @param adjusting
     */
    OBSRemote.prototype.onMicrophoneVolumeChanged = function (volume, muted, adjusting) {
    };

    /**
     * Called when the desktop volume changes, or is muted
     * @param volume
     * @param muted
     * @param adjusting
     */
    OBSRemote.prototype.onDesktopVolumeChanged = function (volume, muted, adjusting) {
    };

    /**
     * Called when OBS Studio is closed
     */
    OBSRemote.prototype.onExit = function () {
    };

    /* jshint ignore:end */

    OBSRemote.prototype._sendMessage = function (requestType, args, callback) {
        if (this._connected) {
            var msgId = this._getNextMsgId();

            // Callback but no args
            if (typeof args === 'function') {
                callback = args;
                args = {};
            }

            // Ensure message isn't undefined, use empty object
            args = args || {};

            // Ensure callback isn't undefined, use empty function
            callback = callback || function () {
                };

            // Store the callback with the message ID
            this._responseCallbacks[msgId] = callback;

            args['message-id'] = msgId;
            args['request-type'] = requestType;

            var serialisedMsg = JSON.stringify(args);
            this._socket.send(serialisedMsg);
        }
    };

    OBSRemote.prototype._getNextMsgId = function () {
        this._messageCounter += 1;
        if (this._messageCounter > OBSRemote.MAX_MSG_ID)
            this._messageCounter = 0;
        return this._messageCounter + '';
    };

    OBSRemote.prototype._messageReceived = function (msg) {
        var message = JSON.parse(msg.data);
        if (!message) {
            return;
        }

        var self = this;
        if (self._debug) {
            console.log(message);
        }

        // Check if this is an update event
        var updateType = message['update-type'];
        if (updateType) {
            switch (updateType) {
                case 'StreamStarting':
                    this.onStreamStarted(message['preview-only']);
                    break;
                case 'StreamStopping':
                    this.onStreamStopped(message['preview-only']);
                    break;
                case 'SwitchScenes':
                    this.onSceneSwitched(message['scene-name']);
                    break;
                case 'StreamStatus':
                    this.onStatusUpdate(message.streaming, message['preview-only'], message['bytes-per-sec'],
                        message.strain, message['total-stream-time'], message['num-total-frames'],
                        message['num-dropped-frames'], message.fps);
                    break;
                case 'ScenesChanged':
                    // Get new scene list before we call onScenesChanged
                    // Why this isn't default behaviour is beyond me
                    this.getSceneList(function (currentScene, scenes) {
                        self.onScenesChanged(scenes);
                    });
                    break;
                case 'SourceOrderChanged':
                    // Call getCurrentScene to get full source details
                    this.getCurrentScene(function (scene) {
                        self.onSourceOrderChanged(scene.sources);
                    });
                    break;
                case 'RepopulateSources':
                    var sources = [];
                    message.sources.forEach(function (source) {
                        sources.push(_convertToOBSSource(source));
                    });
                    this.onSourceAddedOrRemoved(sources);
                    break;
                case 'SourceChanged':
                    this.onSourceChanged(message['source-name'], _convertToOBSSource(message.source));
                    break;
                case 'VolumeChanged':
                    // Which callback do we use
                    var volumeCallback = (message.channel === 'desktop') ?
                        this.onDesktopVolumeChanged :
                        this.onMicrophoneVolumeChanged;

                    volumeCallback(message.volume, message.muted, !message.finalValue);
                    break;
                case 'Exit':
                    this.onExit();
                    break;
                default:
                    console.warn('[OBSRemote] Unknown OBS update type:', updateType, ', full message:', message);
            }
        } else {
            var msgId = message['message-id'];

            if (message.status === 'error') {
                console.error('[OBSRemote] Error:', message.error);
            }

            var callback = this._responseCallbacks[msgId];
            if (callback) {
                callback(message);
                delete this._responseCallbacks[msgId];
            }
        }
    };

    function _convertToOBSScene(scene) {
        var name = scene.name;
        var sources = [];

        if (scene.filters) {
            scene.filters.forEach(function (filter) {
                sources.push(_convertToOBSSource(filter));
            });
        }

        if (scene.sources) {
            scene.sources.forEach(function (source) {
                sources.push(_convertToOBSSource(source));
            });
        }

        return new OBSScene(name, sources);
    }

    function _convertToOBSSource(source) {
        return new OBSSource(source);
    }

    if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
        module.exports = OBSRemote;
    } else {
        window.OBSRemote = OBSRemote;
    }
})();
