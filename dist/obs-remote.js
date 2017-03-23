/*!
 * OBS Remote JS API v1.2.0 (https://github.com/admshao/obs-remote-js)
 * Copyright 2017 Matthew McNamara <matt@mattmcn.com> and Fabio Madia <admshao@gmail.com>
 * Licensed under  ()
 */
(function () {
    'use strict';

    function OBSSource(param) {
        var self = this;
        this.filters = [];
        this.name = param.name || '';
        this.visible = param.visible || true;
        this.audio = param.audio || false;
        this.volume = param.volume || 0;
        this.type = param.type || OBSSource.TYPE.INPUT;
        if (param.filters && param.filters.length > 0) {
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

function convertToOBSSource(source) {
    return new OBSSource(source);
}

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
                case OBSSource.TYPE.SCENE:
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

function convertToOBSScene(scene) {
    var name = scene.name;
    var sources = [];

    if (scene.filters) {
        scene.filters.forEach(function (filter) {
            sources.push(convertToOBSSource(filter));
        });
    }

    if (scene.sources) {
        scene.sources.forEach(function (source) {
            sources.push(convertToOBSSource(source));
        });
    }

    return new OBSScene(name, sources);
}

(function () {
    'use strict';

    function OBSCrypto() {

    }

    OBSCrypto.webCryptoHash = function (pass, callback) {
        var utf8Pass = encodeStringAsUTF8(pass);
        var utf8Salt = encodeStringAsUTF8(OBSRemote.auth.salt);

        var ab1 = stringToArrayBuffer(utf8Pass + utf8Salt);

        var self = this;
        self.crypto.subtle.digest('SHA-256', ab1)
            .then(function (authHash) {
                var utf8AuthHash = encodeStringAsUTF8(arrayBufferToBase64(authHash));
                var utf8Challenge = encodeStringAsUTF8(OBSRemote.auth.challenge);

                var ab2 = stringToArrayBuffer(utf8AuthHash + utf8Challenge);

                self.crypto.subtle.digest('SHA-256', ab2)
                    .then(function (authResp) {
                        var authRespB64 = arrayBufferToBase64(authResp);
                        callback(authRespB64);
                    });
            });
    };

    OBSCrypto.cryptoJSHash = function (pass, callback) {
        var utf8Pass = encodeStringAsUTF8(pass);
        var utf8Salt = encodeStringAsUTF8(OBSRemote.auth.salt);

        var authHash = CryptoJS.SHA256(utf8Pass + utf8Salt).toString(CryptoJS.enc.Base64);

        var utf8AuthHash = encodeStringAsUTF8(authHash);
        var utf8Challenge = encodeStringAsUTF8(OBSRemote.auth.challenge);

        var authResp = CryptoJS.SHA256(utf8AuthHash + utf8Challenge).toString(CryptoJS.enc.Base64);

        callback(authResp);
    };

    OBSCrypto.nodeCryptoHash = function (pass, callback) {
        var authHasher = self.crypto.createHash('sha256');

        var utf8Pass = encodeStringAsUTF8(pass);
        var utf8Salt = encodeStringAsUTF8(OBSRemote.auth.salt);

        authHasher.update(utf8Pass + utf8Salt);
        var authHash = authHasher.digest('base64');

        var respHasher = self.crypto.createHash('sha256');

        var utf8AuthHash = encodeStringAsUTF8(authHash);
        var utf8Challenge = encodeStringAsUTF8(OBSRemote.auth.challenge);

        respHasher.update(utf8AuthHash + utf8Challenge);
        var respHash = respHasher.digest('base64');

        callback(respHash);
    };

    function encodeStringAsUTF8(string) {
        return unescape(encodeURIComponent(string)); //jshint ignore:line
    }

    function stringToArrayBuffer(string) {
        var ret = new Uint8Array(string.length);
        for (var i = 0; i < string.length; i++) {
            ret[i] = string.charCodeAt(i);
        }
        return ret.buffer;
    }

    function arrayBufferToBase64(arrayBuffer) {
        var binary = '';
        var bytes = new Uint8Array(arrayBuffer);

        var length = bytes.byteLength;
        for (var i = 0; i < length; i++) {
            binary += String.fromCharCode(bytes[i]);
        }

        return btoa(binary);
    }

    if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
        OBSCrypto.crypto = require('crypto');
        OBSCrypto.authHash = OBSCrypto.nodeCryptoHash;
        module.exports.OBSCrypto = OBSCrypto;
    } else {
        OBSCrypto.crypto = window.crypto || window.msCrypto || {};
        OBSCrypto.authHash = OBSCrypto.webCryptoHash;

        if (typeof crypto.subtle === 'undefined') {
            // Safari crypto.subtle is prefixed, all other browsers use subtle or don't implement
            if (typeof crypto.webkitSubtle === 'undefined') {
                // Native crypto not available, fall back to CryptoJS
                if (typeof CryptoJS === 'undefined') {
                    throw new Error('OBS Remote requires CryptoJS when native crypto is not available!');
                }

                OBSCrypto.authHash = OBSCrypto.cryptoJSHash;
            } else {
                OBSCrypto.crypto.subtle = OBSCrypto.crypto.webkitSubtle;
            }
        }

        window.OBSCrypto = OBSCrypto;
    }
})();

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

// OBS Studio API CALLBACKS

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
 */
OBSRemote.prototype.onAuthenticationFailed = function () {
};

/**
 * Called when OBS switches to a scene. The first item
 * is automatically selected if existing
 * @param sceneName scene OBS has switched to
 */
OBSRemote.prototype.onSceneSwitched = function (sceneName) {
};

/**
 * Called when OBS Adds, Remove or Rename a scene
 * @param current current selected scene
 * @param scenes array of existing scenes
 */
OBSRemote.prototype.onSceneListChanged = function (current, scenes) {
}

/**
 * Called when OBS tries to start recording
 */
OBSRemote.prototype.onRecordingStarting = function () {
};

/**
 * Called when OBS started to record
 */
OBSRemote.prototype.onRecordingStarted = function () {
};

/**
 * Called when OBS tries to stop recording
 */
OBSRemote.prototype.onRecordingStopping = function () {
};

/**
 * Called when OBS stopped to record
 */
OBSRemote.prototype.onRecordingStopped = function () {
};

/**
 * Called when OBS tries to start streaming
 */
OBSRemote.prototype.onStreamingStarting = function () {
};

/**
 * Called when OBS started to stream
 */
OBSRemote.prototype.onStreamingStarted = function () {
};

/**
 * Called when OBS tries to stop streaming
 */
OBSRemote.prototype.onStreamingStopping = function () {
};

/**
 * Called when OBS stopped to stream
 */
OBSRemote.prototype.onStreamingStopped = function () {
};

/**
 * Called when OBS has Changed a collection, Renamed, Added or Removed a scene
 */
OBSRemote.prototype.onSceneCollectionChanged = function () {
};

/**
 * Called when OBS has Renamed, Added or Removed a scene
 */
OBSRemote.prototype.onSceneCollectionListChanged = function () {
};

/**
 * Called when OBS has Changed, Renamed, Added or Removed a profile
 */
OBSRemote.prototype.onProfileChanged = function () {
};

/**
 * Called when OBS has Renamed, Added or Removed a profile
 */
OBSRemote.prototype.onProfileListChanged = function () {
};

/**
 * Called when a Source visibility has changed
 * @param source source name
 * @param visible source visibility
 */
OBSRemote.prototype.onItemVisible = function (source, visible) {
}

OBSRemote.prototype.onItemAdd = function (source) {
};

OBSRemote.prototype.onItemRemove = function (name) {
};

OBSRemote.prototype.onItemReorder = function (sources) {
};

OBSRemote.prototype.onItemRenamed = function (oldName, newName) {
};

OBSRemote.prototype.onItemSelect = function (oldName, newName) {
};

OBSRemote.prototype.onItemDeselect = function (oldName, newName) {
};

OBSRemote.prototype.onSourceVolume = function (source, volume) {
};

OBSRemote.prototype.onSourceMute = function (source, muted) {
};

OBSRemote.prototype.onGlobalAudioSourcesChanged = function (sources) {
};

/**
 * Called when OBS Studio is closed
 */
OBSRemote.prototype.onExit = function () {
};
