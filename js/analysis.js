
if (window.pageView && pageView.analysisRequest()) { /* XXX: find better test */
    (function() {
        var cps = [
            ['5s', 5],
            ['10s', 10],
            ['20s', 20],
            ['30s', 30],
            ['1min', 60],
            ['2min', 120],
            ['5min', 300],
            ['10min', 600],
            ['20min', 1200],
            ['30min', 1800],
            ['60min', 3600]
        ];

        function on_stream_data() {
            var streams = pageView.streams();
            var watts_stream = streams.getStream('watts');
            if (!watts_stream) {
                return;
            }
            var ts_stream = streams.getStream('time'); 
            document.getElementById('critpower').style.display = 'block';
            cps.forEach(function(cp) {
                var watts = critpower(ts_stream, watts_stream, cp[1]);
                var el = document.getElementById('cp-' + cp[1]);
                el.innerHTML = Math.round(watts) + '&nbsp;watts';
            });
        }

        function critpower(ts_stream, watts_stream, period) {
            var ring = [];
            var rolling_sum = 0;
            var max = 0;
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
        pageView.analysisRequest().deferred.done(on_stream_data);
    })();
}

