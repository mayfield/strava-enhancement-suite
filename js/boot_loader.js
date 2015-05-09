
function ses_inject_script(content, callback) {
    var elem = document.createElement('script');

    if (content.indexOf('/') === 0) {
        elem.src = chrome.extension.getURL(content);
    } else {
        elem.textContent = content;
    }

    elem.onload = function () {
        typeof callback === 'function' && callback.apply(this);
    };

    document.head.appendChild(elem);
};


chrome.storage.sync.get(null, function(config) {
    var load = [
        'analysis'
    ];

    ses_inject_script('/pages/options.js', function() {
        config = JSON.stringify(config);
        ses_inject_script('var ses_user_config = ' + config + ';');
        load.forEach(function(x) {
            ses_inject_script('/js/' + x + '.js');
        });
    });
});
