(function () {
    'use strict';

    function OBSRemote() {
        Object.defineProperty(this, "apiVersion", {value: 1.1, writable: false});

        this._connected = false;
        this._socket = undefined;
        this._messageCounter = 0;
        this._responseCallbacks = {};

        this._auth = {salt: "", challenge: ""};
    }

    // IE11 crypto object is prefixed
    var crypto = window.crypto || window.msCrypto || {};

    OBSRemote.prototype._authHash = _webCryptoHash;

    if (typeof crypto.subtle === "undefined") {
        // Safari crypto.subtle is prefixed, all other browsers use subtle or don't implement
        if (typeof crypto.webkitSubtle === "undefined") {
            // Native crypto not available, fall back to CryptoJS
            if (typeof CryptoJS === "undefined") {
                throw new Error("OBS Remote requires CryptoJS when native crypto is not available!");
            }

            OBSRemote.prototype._authHash = _cryptoJSHash;
        } else {
            crypto.subtle = crypto.webkitSubtle;
        }
    }

    Object.defineProperty(OBSRemote, "DEFAULT_PORT", {value: 4444, writable: false});
    Object.defineProperty(OBSRemote, "WS_PROTOCOL", {value: "obsapi", writable: false});

    /**
     * Try to connect to OBS, with optional password
     * @param address "ipAddress" or "ipAddress:port"
     *        defaults to "localhost"
     * @param password Optional authentication password
     */
    OBSRemote.prototype.connect = function(address, password) {
        // Password is optional, set to empty string if undefined
        password = (typeof password === "undefined") ?
            "" :
            password;

        // Check for address
        address = (typeof address === "undefined" || address === "") ?
            "localhost" :
            address;

        // Check for port number, if missing use 4444
        var colonIndex = address.indexOf(':');
        if (colonIndex < 0 || colonIndex === address.length - 1) {
            address += ":" + OBSRemote.DEFAULT_PORT;
        }

        // Check if we already have a connection
        if (this._connected) {
            this._socket.close();
            this._connected = false;
        }

        // Connect and setup WebSocket callbacks
        this._socket = new WebSocket("ws://" + address, OBSRemote.WS_PROTOCOL);

        var self = this;

        this._socket.onopen = function(event) {
            self._connected = true;
            self.onConnectionOpened();

            self.isAuthRequired(function(required) {
                if (!required) return;

                self.authenticate(password);
            });
        };

        this._socket.onclose = function(code, reason, wasClean) {
            self.onConnectionClosed();
            self._connected = false;
        };

        this._socket.onerror = function(event) {
            self.onConnectionFailed();
            self._connected = false;
        };

        this._socket.onmessage = function(message) {
            self._messageReceived(message);
        };
    };

    /**
     * Attempts to authenticate with OBS
     * Will cause either onAuthenticationFailed or onAuthenticationSucceeded to be called
     * @param password the password to try authenticating with
     */
    OBSRemote.prototype.authenticate = function(password) {
        var self = this;
        this._authHash(password, function(authResp) {

            function cb(message) {
                var successful = (message.status === "ok");
                var remainingAttempts = 0;

                if (!successful) {
                    // TODO: improve and pull request I guess?
                    // ¯\_(ツ)_/¯
                    remainingAttempts = message.error.substr(43);

                    self.onAuthenticationFailed(remainingAttempts);
                } else {
                    self.onAuthenticationSucceeded();
                }
            }

            self._sendMessage("Authenticate", {
                "auth": authResp
            }, cb);
        });
    };

    /**
     * Starts or stops OBS from streaming, recording, or previewing.
     * Result of this will be either the onStreamStarted or onStreamStopped callback.
     * @param previewOnly Only toggle the preview
     */
    OBSRemote.prototype.toggleStream = function(previewOnly) {
        // previewOnly is optional, default to false
        previewOnly = (typeof previewOnly === "undefined") ?
            false :
            previewOnly;

        this._sendMessage("StartStopStreaming", {
            "preview-only": previewOnly
        });
    };

    /**
     * Requests OBS Remote version
     * @param callback function(Number version)
     */
    OBSRemote.prototype.getVersion = function(callback) {
        function cb (message) {
            callback(message.version);
        }

        this._sendMessage("GetVersion", cb);
    };

    /**
     * Checks if authentication is required
     * @param callback function(Boolean isRequired)
     */
    OBSRemote.prototype.isAuthRequired = function(callback) {
        var self = this;
        function cb (message) {
            var authRequired = message.authRequired;

            if (authRequired) {
                self._auth.salt = message.salt;
                self._auth.challenge = message.challenge;
            }

            callback(authRequired);
        }

        this._sendMessage("GetAuthRequired", cb);
    };

    /**
     * Gets name of current scene and full list of all other scenes
     * @param callback function(String currentScene, Array scenes)
     */
    OBSRemote.prototype.getSceneList = function(callback) {
        function cb (message) {
            var currentScene = message["current-scene"];
            var scenes = [];

            message.scenes.forEach(function(scene) {
                scenes.push(_convertToOBSScene(scene));
            });

            callback(currentScene, scenes);
        }

        this._sendMessage("GetSceneList", cb);
    };

    /**
     * Gets the current scene and full list of sources
     * @param callback function(OBSScene scene)
     */
    OBSRemote.prototype.getCurrentScene = function(callback) {
        function cb (message) {
            var obsScene = _convertToOBSScene(message);

            callback(obsScene);
        }

        this._sendMessage("GetCurrentScene", cb);
    };

    /**
     * Tells OBS to switch to the given scene name
     * If successful the onSceneSwitched() callback will be called
     * @param sceneName name of scene to switch to
     */
    OBSRemote.prototype.setCurrentScene = function(sceneName) {
        this._sendMessage("SetCurrentScene", {
            "scene-name": sceneName
        });
    };

    /**
     * Reorders sources in the current scene
     * @param sources Array of Strings, or OBSSources
     */
    OBSRemote.prototype.setSourcesOrder = function(sources) {
        var sourceNames = sources;

        // Support Array[OBSSource] for convenience
        if (typeof sources[1] === "OBSSource") {
            sourceNames = [];
            sources.forEach(function (source) {
                sourceNames.push(source.name);
            });
        }

        this._sendMessage("SetSourcesOrder", {
            "scene-names": sourceNames
        });
    };

    /**
     * Sets a source's render state in the current scene
     * @param sourceName
     * @param shouldRender
     */
    OBSRemote.prototype.setSourceRender = function(sourceName, shouldRender) {
        this._sendMessage("SetSourceRender", {
            source: sourceName,
            render: shouldRender
        });
    };

    /**
     * Gets current streaming status, and if we're previewing or not
     * @param callback function(Boolean streaming, Boolean previewOnly)
     */
    OBSRemote.prototype.getStreamingStatus = function(callback) {
        function cb(message) {
            callback(message.streaming, message["preview-only"]);
        }

        this._sendMessage("GetStreamingStatus", cb);
    };

    /**
     * Gets current volume levels and mute statuses
     * @param callback function(Number microphoneVolume, Boolean microphoneMuted, Number desktopVolume, Boolean desktop)
     */
    OBSRemote.prototype.getVolumes = function(callback) {
        function cb(message) {
            callback(message["mic-volume"], message["mic-muted"], message["desktop-volume"], message["desktop-muted"]);
        }

        this._sendMessage("GetVolumes", cb);
    };

    /**
     * Sets microphone volume, and whether we're still adjusting it
     * @param volume
     * @param adjusting Optional, defaults to false
     */
    OBSRemote.prototype.setMicrophoneVolume = function(volume, adjusting) {
        adjusting = (typeof adjusting === "undefined") ?
            false :
            adjusting;

        this._sendMessage("SetVolume", {
            channel: "microphone",
            volume: volume,
            final: !adjusting
        });
    };

    /**
     * Toggles microphone mute state
     */
    OBSRemote.prototype.toggleMicrophoneMute = function() {
        this._sendMessage("ToggleMute", {
            channel: "microphone"
        });
    };

    /**
     * Sets desktop volume, and whether we're still adjusting it
     * @param volume
     * @param adjusting Optional, defaults to false
     */
    OBSRemote.prototype.setDesktopVolume = function(volume, adjusting) {
        adjusting = (typeof adjusting === "undefined") ?
            false :
            adjusting;

        this._sendMessage("SetVolume", {
            channel: "desktop",
            volume: volume,
            final: !adjusting
        });
    };

    /**
     * Toggles desktop mute state
     */
    OBSRemote.prototype.toggleDesktopMute = function() {
        this._sendMessage("ToggleMute", {
            channel: "desktop"
        });
    };

    OBSRemote.prototype.onConnectionOpened = function() {};

    OBSRemote.prototype.onConnectionClosed = function() {};

    OBSRemote.prototype.onConnectionFailed = function() {};

    OBSRemote.prototype.onStreamStarted = function(previewOnly) {};

    OBSRemote.prototype.onStreamStopped = function(previewOnly) {};

    OBSRemote.prototype.onSceneSwitched = function(sceneName) {};

    OBSRemote.prototype.onAuthenticationSucceeded = function() {};

    OBSRemote.prototype.onAuthenticationFailed = function(remainingAttempts) {};

    OBSRemote.prototype._sendMessage = function(requestType, args, callback) {
        if (this._connected) {
            var msgId = this._getNextMsgId();

            // Callback but no args
            if (typeof args === "function") {
                callback = args;
                args = {};
            }

            // Ensure message isn't undefined, use empty object
            args = (typeof args === "undefined") ?
                {} :
                args;

            // Ensure callback isn't undefined, use empty function
            callback = (typeof callback === "undefined") ?
                function () {} :
                callback;

            // Store the callback with the message ID
            this._responseCallbacks[msgId] = callback;

            args["message-id"] = msgId;
            args["request-type"] = requestType;

            var serialisedMsg = JSON.stringify(args);
            this._socket.send(serialisedMsg);
        }
    };

    OBSRemote.prototype._getNextMsgId = function() {
        this._messageCounter += 1;
        return this._messageCounter + "";
    };

    OBSRemote.prototype._messageReceived = function(msg) {
        var message = JSON.parse(msg.data);
        if (!message) {
            return;
        }

        // Check if this is an update event
        var updateType = message["update-type"];
        if (updateType) {
            switch (updateType) {
                case "StreamStarting":
                    this.onStreamStarted(message["preview-only"]);
                    break;
                case "StreamStopping":
                    this.onStreamStopped(message["preview-only"]);
                    break;
                case "SwitchScenes":
                    this.onSceneSwitched(message["scene-name"]);
                    break;
                default:
                    console.warn("[OBSRemote] Unknown OBS update type:", updateType, ", full message:");
                    console.warn(message);
            }
        } else {
            var msgId = message["message-id"];

            if (message.status === "error") {
                console.error("[OBSRemote] Error:", message.error);
            }

            var callback = this._responseCallbacks[msgId];
            callback(message);
            delete this._responseCallbacks[msgId];
        }
    };

    function _webCryptoHash(pass, callback) {
        var utf8Pass = _encodeStringAsUTF8(pass);
        var utf8Salt = _encodeStringAsUTF8(this._auth.salt);

        var ab1 = _stringToArrayBuffer(utf8Pass + utf8Salt);

        var self = this;
        crypto.subtle.digest("SHA-256", ab1)
            .then(function(authHash) {
                var utf8AuthHash = _encodeStringAsUTF8(_arrayBufferToBase64(authHash));
                var utf8Challenge = _encodeStringAsUTF8(self._auth.challenge);

                var ab2 = _stringToArrayBuffer(utf8AuthHash + utf8Challenge);

                crypto.subtle.digest("SHA-256", ab2)
                    .then(function(authResp) {
                        var authRespB64 = _arrayBufferToBase64(authResp);
                        callback(authRespB64);
                    });
            });
    }

    function _cryptoJSHash(pass, callback) {
        var utf8Pass = _encodeStringAsUTF8(pass);
        var utf8Salt = _encodeStringAsUTF8(this._auth.salt);

        var authHash = CryptoJS.SHA256(utf8Pass + utf8Salt).toString(CryptoJS.enc.Base64);

        var utf8AuthHash = _encodeStringAsUTF8(authHash);
        var utf8Challenge = _encodeStringAsUTF8(this._auth.challenge);

        var authResp = CryptoJS.SHA256(utf8AuthHash + utf8Challenge).toString(CryptoJS.enc.Base64);

        callback(authResp);
    }

    function _encodeStringAsUTF8(string) {
        return unescape(encodeURIComponent(string));
    }

    function _stringToArrayBuffer(string) {
        var ret = new Uint8Array(string.length);
        for (var i = 0; i < string.length; i++) {
            ret[i] = string.charCodeAt(i);
        }
        return ret.buffer;
    }

    function _arrayBufferToBase64(arrayBuffer) {
        var alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
        var base64String = "";
        var n, p, bits;

        var uint8 = new Uint8Array(arrayBuffer);
        var len = arrayBuffer.byteLength * 8;
        for (var offset = 0; offset < len; offset += 6) {
            n = (offset/8) | 0;
            p = offset % 8;
            bits = ((uint8[n] || 0) << p) >> 2;
            if (p > 2) {
                bits |= (uint8[n+1] || 0) >> (10 - p);
            }
            base64String += alphabet.charAt(bits & 63);
        }
        base64String += (p == 4) ?
            '=' :
            (p == 6) ?
                '==':
                '';
        return base64String;
    }

    function _convertToOBSScene(scene) {
        var name = scene.name;
        var sources = [];

        scene.sources.forEach(function(source) {
            sources.push(_convertToOBSSource(source));
        });

        return new OBSScene(name, sources);
    }

    function _convertToOBSSource(source) {
        return new OBSSource(source.cx, source.cy, source.x, source.y, source.name, source.render);
    }

    if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
        module.exports = OBSRemote;
    } else {
        window.OBSRemote = OBSRemote;
    }
})();
