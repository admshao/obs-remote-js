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
