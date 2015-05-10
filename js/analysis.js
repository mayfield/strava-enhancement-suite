
function ses_analysis_start() {

    console.log('Starting SES Analysis Extention');

    /* TODO: Move to user options. */
    var CP_PERIODS = [
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
        ['1hour', 3600]
    ];
    /* Max gap-seconds to permit without zero-padding. */
    var MAX_DATA_GAP = 5;

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

    var RollingAvg = function(period) {
        this.d = [];
        this.period = period;
        this.sum = 0;
    };

    RollingAvg.prototype.add = function(ts, value) {
        this.d.push({ts: ts, value: value});
        this.sum += value;
        while (ts - this.d[0].ts >= this.period) {
            this.sum -= this.d[0].value;
            this.d.shift();
        }
    };

    RollingAvg.prototype.avg = function() {
        return this.sum / this.d.length;
    };

    RollingAvg.prototype.full = function() {
        return this.d[this.d.length-1].ts - this.d[0].ts == (this.period - 1);
    };
 
    var on_stream_data = function() {
        console.log("Parsing Watts Stream for Critical Power Chart");
        var start = new Date;
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
        CP_PERIODS.forEach(function(cp) {
            var watts = critpower_smart(ts_stream, watts_stream, cp[1]);
            var el = document.getElementById('cp-' + cp[1]);
            if (!watts) {
                el.innerHTML = '<i>n/a</i>';
            } else {
                el.innerHTML = Math.round(watts) + 'w';
            }
        });
    }

    var critpower_wall = function(ts_stream, watts_stream, period) {
        var ring = new RollingAvg(period);
        var max = 0;
        var ts_size = ts_stream.length;
        for (var i = 0; i < ts_size; i++) {
            var watts = watts_stream[i];
            var ts = ts_stream[i];
            ring.add(ts, watts);
            if ((ring[ring.length-1].ts - ring[0].ts) / (ring.period-1) > 0.99) {
                max = Math.max(ring.avg(), max);
            }
        }
        return max;
    }

    var critpower_sample = function(watts_stream, period) {
        var ring = new RollingAvg(period);
        for (var i = 0, max = 0, len = watts_stream.length; i < len; i++) {
            ring.add(i, watts_stream[i]);
            if (ring.full()) {
                max = Math.max(ring.avg(), max);
            }
        }
        return max;
    }

    var critpower_smart = function(ts_stream, watts_stream, period) {
        var ring = new RollingAvg(period);
        var max = 0;
        var range = 0;
        var ts_size = ts_stream.length;
        for (var i = 0; i < ts_size; i++) {
            var watts = watts_stream[i];
            var ts = ts_stream[i];
            var gap = i > 0 && ts - ts_stream[i-1];
            if (gap > MAX_DATA_GAP) {
                for (var ii = 1; ii < gap; ii++) {
                    ring.add(ts_stream[i-1]+ii, 0);
                }
            }
            ring.add(ts, watts);
            if (ring.full()) {
                max = Math.max(ring.avg(), max);
            }
        }
        return max;
    }

    var panel = [
        '<ul id="critpower" style="display: none;" class="pagenav">',
            '<li class="group">',
                '<div class="title">Critical Power</div>',
                '<table>'
    ];
    CP_PERIODS.forEach(function(x) {
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

