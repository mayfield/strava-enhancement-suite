chrome.storage.sync.get(null, function(items) {
    var hides = [];
    if (items.hide_challenge_feed_entries) {
        hides.push('div.feed-entry.challenge');
    }
    if (items.hide_goal_feed_entries) {
        hides.push('div.feed-entry.performance-goal-created');
    }
    if (items.hide_promotion_feed_entries) {
        hides.push('div.feed-entry.promo');
    }
    if (items.hide_invite_friends) {
        hides.push('div.social > div.btn-group > div.share');
        hides.push('div.social .badge.premium');
    }
    if (!hides) {
        return;
    }
    var css = hides.join(', ');
    css += ' { display: none; }';
    var style = document.createElement('style');
    style.type = 'text/css';
    style.appendChild(document.createTextNode(css));
    document.head.appendChild(style);
});
