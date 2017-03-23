(function () {
    'use strict';

    var OBSCrypto = {};
    var OBSSource = {};
    var OBSScene = {};

    if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
        OBSScene = module.exports.OBSScene;
        OBSSource = module.exports.OBSSource;
        OBSCrypto = module.exports.OBSCrypto;
        window.WebSocket = require('ws');
    } else {
        OBSScene = window.OBSScene;
        OBSSource = window.OBSSource;
        OBSCrypto = window.OBSCrypto;
    }

    function OBSRemote(debug) {
        OBSRemote.API_VERSION = 1.0;
        OBSRemote.DEFAULT_PORT = 4444;
        OBSRemote.WS_PROTOCOL = 'obsapi';
        OBSRemote.MAX_MSG_ID = 4294967295; // Math.pow(2,32) - 1
        OBSRemote.auth = {salt: '', challenge: ''};

        this._debug = debug || false;
        this._connected = false;
        this._socket = undefined;
        this._messageCounter = 0;
        this._responseCallbacks = {};
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
        OBSCrypto.authHash(password, function (authResp) {

            function cb(message) {
                if (message.status !== 'ok') {
                    self.onAuthenticationFailed();
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
        function cb(message) {
            var authRequired = message.authRequired;

            if (authRequired) {
                OBSRemote.auth.salt = message.salt;
                OBSRemote.auth.challenge = message.challenge;
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
                scenes.push(convertToOBSScene(scene));
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
            var obsScene = convertToOBSScene(message);

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
     * Tells OBS to start a record
     */
    OBSRemote.prototype.startRecording = function () {
        this._sendMessage('StartRecording');
    };

    /**
     * Tells OBS to stop a record
     */
    OBSRemote.prototype.stopRecording = function () {
        this._sendMessage('StopRecording');
    };

    /**
     * Checks if OBS is recording right now
     */
    OBSRemote.prototype.recordingActive = function (callback) {
        function cb(message) {
            callback(message.recording);
        }

        this._sendMessage('RecordingActive', cb);
    };

    /**
     * Tells OBS to start a stream
     */
    OBSRemote.prototype.startStreaming = function () {
        this._sendMessage('StartStreaming');
    };

    /**
     * Tells OBS to stop a stream
     */
    OBSRemote.prototype.stopStreaming = function () {
        this._sendMessage('StopStreaming');
    };

    /**
     * Checks if OBS is streaming right now
     */
    OBSRemote.prototype.streamingActive = function (callback) {
        function cb(message) {
            callback(message.streaming);
        }

        this._sendMessage('StreamingActive', cb);
    };

    /**
     * Returns a list with scene collections names
     * @param callback
     */
    OBSRemote.prototype.listSceneCollections = function (callback) {
        function cb(message) {
            var names = [];

            message['scene-collections'].forEach(function (scene) {
                names.push(scene.name);
            });

            callback(names);
        }

        this._sendMessage('ListSceneCollections', cb);
    };

    /**
     * Sets the current scene collection
     * @param sceneCollectionName
     */
    OBSRemote.prototype.setCurrentSceneCollection = function (sceneCollectionName) {
        this._sendMessage('SetCurrentSceneCollection', {
            'scene-collection-name': sceneCollectionName
        });
    };

    OBSRemote.prototype.getCurrentSceneCollection = function (callback) {
        function cb(message) {
            callback(message['scene-collection-name']);
        }

        this._sendMessage('GetCurrentSceneCollection', cb);
    };

    /**
     * Returns a list with scene collections names
     * @param callback
     */
    OBSRemote.prototype.listProfiles = function (callback) {
        function cb(message) {
            var names = [];

            message.profiles.forEach(function (profile) {
                names.push(profile.name);
            });

            callback(names);
        }

        this._sendMessage('ListProfiles', cb);
    };

    /**
     * Sets the current profile
     * @param sceneCollectionName
     */
    OBSRemote.prototype.setCurrentProfile = function (profileName) {
        this._sendMessage('SetCurrentProfile', {
            'profile-name': profileName
        });
    };

    OBSRemote.prototype.getCurrentProfile = function (callback) {
        function cb(message) {
            callback(message['profile-name']);
        }

        this._sendMessage('GetCurrentProfile', cb);
    };

    OBSRemote.prototype.getGlobalAudioList = function (callback) {
        function cb(message) {
            var names = [];

            message.sources.forEach(function (source) {
                names.push(convertToOBSSource(source));
            });

            callback(names);
        }

        this._sendMessage('GetGlobalAudioList', cb);
    };

    OBSRemote.prototype.setVolume = function (source, volume) {
        this._sendMessage('SetVolume', {
            'source': source,
            'volume': volume
        });
    };

    OBSRemote.prototype.getVolume = function (source, callback) {
        function cb(message) {
            callback(message['volume']);
        }

        this._sendMessage('GetVolume', {
            'source': source
        }, cb);
    };

    OBSRemote.prototype.setMuted = function (source, muted) {
        this._sendMessage('SetMuted', {
            'source': source,
            'muted': muted
        });
    }

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
                case 'RecordingStarting':
                    this.onRecordingStarting();
                    break;
                case 'RecordingStarted':
                    this.onRecordingStarted();
                    break;
                case 'RecordingStopping':
                    this.onRecordingStopping();
                    break;
                case 'RecordingStopped':
                    this.onRecordingStopped();
                    break;
                case 'StreamingStarting':
                    this.onStreamingStarting();
                    break;
                case 'StreamingStarted':
                    this.onStreamingStarted();
                    break;
                case 'StreamingStopping':
                    this.onStreamingStopping();
                    break;
                case 'StreamingStopped':
                    this.onStreamingStopped();
                    break;
                case 'ProfileChanged':
                    this.onProfileChanged();
                    break;
                case 'ProfileListChanged':
                    this.onProfileListChanged();
                    break;
                case 'SceneCollectionChanged':
                    this.onSceneCollectionChanged();
                    break;
                case 'SceneCollectionListChanged':
                    this.onSceneCollectionListChanged();
                    break;
                case 'SwitchScenes':
                    this.onSceneSwitched(message['scene-name']);
                    break;
                case 'ScenesChanged':
                    this.getSceneList(function (currentScene, scenes) {
                        self.onSceneListChanged(currentScene, scenes);
                    });
                    break;
                case 'ItemAdd':
                    this.onItemAdd(convertToOBSSource(message));
                    break;
                case 'ItemRemove':
                    this.onItemRemove(message.name);
                    break;
                case 'ItemReorder':
                    this.onItemReorder(message.sources);
                    break;
                case 'ItemVisible':
                    this.onItemVisible(message.source, message.visible);
                    break;
                case 'ItemRename':
                    this.onItemRenamed(message.prev_name, message.new_name);
                    break;
                case 'ItemSelect':
                    this.onItemSelect(message.name);
                    break;
                case 'ItemDeselect':
                    this.onItemDeselect(message.name);
                    break;
                case 'SourceVolume':
                    this.onSourceVolume(message.name, message.volume);
                    break;
                case 'SourceMute':
                    this.onSourceMute(message.name, message.muted);
                    break;
                case 'GlobalAudioSourcesChanged':
                    this.getGlobalAudioList(function (sources) {
                        self.onGlobalAudioSourcesChanged(sources);
                    });
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

    if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
        module.exports = OBSRemote;
    } else {
        window.OBSRemote = OBSRemote;
    }
})();
