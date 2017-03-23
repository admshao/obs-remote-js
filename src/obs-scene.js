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
