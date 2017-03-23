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
