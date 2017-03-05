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
