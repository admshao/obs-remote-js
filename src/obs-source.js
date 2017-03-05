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
