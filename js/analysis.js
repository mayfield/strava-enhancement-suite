
function ses_analysis_start() {

    console.log('Starting SES Analysis Extention');

    var cps = [
        ['5s', 5],
        ['15s', 10],
        ['30s', 30],
        ['1min', 60],
        ['2min', 120],
        ['5min', 300],
        ['10min', 600],
        ['15min', 900],
        ['20min', 1200],
        ['30min', 1800],
        ['1hour', 3600],
        ['2hour', 7200]
    ];

    var adjunct = function(run_after, obj, orig_func_name, interceptor) {
        var save_fn = obj.prototype[orig_func_name];
        function wrap() {
            if (run_after) {
                var ret = save_fn.apply(this, arguments);
                var args = Array.prototype.slice.call(arguments)
                args.unshift(ret);
                interceptor.apply(this, args);
                return ret;
            } else {
                interceptor.apply(this, arguments);
                return save_fn.apply(this, arguments);
            }
        }
        obj.prototype[orig_func_name] = wrap;
    }

    var run_after = function(obj, orig_func_name, interceptor) {
        adjunct(true, obj, orig_func_name, interceptor);
    }

    var run_before = function(obj, orig_func_name, interceptor) {
        adjunct(false, obj, orig_func_name, interceptor);
    }
 
    var on_stream_data = function() {
        console.log("Parsing Watts Stream for Critical Power Chart");
        var streams = pageView.streams();
        var watts_stream = streams.getStream('watts');
        if (!watts_stream) {
            watts_stream = streams.getStream('watts_calc');
            if (!watts_stream) {
                return;
            }
        }
        var ts_stream = streams.getStream('time'); 
        document.getElementById('critpower').style.display = 'block';
        cps.forEach(function(cp) {
            var watts = critpower(ts_stream, watts_stream, cp[1]);
            var el = document.getElementById('cp-' + cp[1]);
            if (watts === undefined) {
                el.innerHTML = '<i>n/a</i>';
            } else {
                el.innerHTML = Math.round(watts) + '&nbsp;watts';
            }
        });
    }

    var critpower = function(ts_stream, watts_stream, period) {
        var ring = [];
        var rolling_sum = 0;
        var max = 0;
        if (ts_stream[ts_stream.length-1] - ts_stream[0] < period) {
            return;
        }
        for (var i = 0, len = ts_stream.length; i < len; i++) {
            var watts = watts_stream[i];
            var ts = ts_stream[i];
            ring.push({ts: ts, watts: watts});
            rolling_sum += watts;
            while (ts - ring[0].ts >= period) {
                rolling_sum -= ring[0].watts;
                ring.shift();
            }
            max = Math.max(rolling_sum / ring.length, max);
        };
        return max;
    }

    var panel = [
        '<ul id="critpower" style="display: none;" class="pagenav">',
            '<li class="group">',
                '<div class="title">Critical Power</div>',
                '<table>'
    ];
    cps.forEach(function(x) {
        var r = ['<tr><td>', x[0], '</td><td id="cp-', x[1], '">...</td></tr>'];
        panel.push(r.join(''));
    });
    panel.push('</table></li></ul>');
    jQuery(panel.join('')).insertBefore('.actions-menu');

    pageView.streamsRequest.deferred.done(function() {
        on_stream_data();
    });

    run_before(Strava.Labs.Activities.StreamsRequest, 'request', function() {
        this.require('watts');
    });
}


/* We have to aggressively track script loading to jack into Strava's site
 * while it's still worth altering.  E.g. Before it makes ext API calls.
 */ 
document.head.addEventListener('DOMNodeInserted', function(event) {
    if (window.pageView) {
        document.head.removeEventListener(event.type, arguments.callee);
        ses_analysis_start();
    }
});

