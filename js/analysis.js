
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
        this._times = [];
        this._values = [];
        this.period = period;
        this.sum = 0;
    };

    RollingAvg.prototype.add = function(ts, value) {
        this._times.push(ts);
        this._values.push(value);
        this.sum += value;
        while (ts - this._times[0] >= this.period) {
            this.sum -= this._values[0];
            this.shift();
        }
    };

    RollingAvg.prototype.avg = function() {
        return this.sum / this._values.length;
    };

    RollingAvg.prototype.full = function() {
        var t = this._times;
        return t[t.length-1] - t[0] == (this.period - 1);
    };

    RollingAvg.prototype.shift = function() {
        this._times.shift();
        this._values.shift();
    };

    RollingAvg.prototype.copy = function() {
        var copy = new RollingAvg(this.period);
        copy.sum = this.sum;
        copy._times = this._times.slice(0);
        copy._values = this._values.slice(0);
        return copy;
    };
 
    var on_stream_data = function() {
        console.log("Parsing Watts Stream for Critical Power Chart");
        var streams = pageView.streams();
        var watts_stream = streams.getStream('watts');
        if (!watts_stream) {
            watts_stream = streams.getStream('watts_calc');
            if (!watts_stream) {
                return;
            }
            /* Only show large period for watt estimates. */
            var too_small = [];
            CP_PERIODS.forEach(function(x, i) {
                if (x[1] < 300) {
                    too_small.push(i);
                }
            });
            too_small.sort().reverse().forEach(function(i) {
                jQuery('#ses-cp-row-' + CP_PERIODS[i][1]).hide();
                delete CP_PERIODS[i];
            });
        }
        var ts_stream = streams.getStream('time'); 

        var athlete = pageView.activityAthlete();
        var weight_kg = weight_norm = pageView.activityAthleteWeight();
        var weight_unit = athlete.get('weight_measurement_unit');
        if (weight_unit == 'lbs') {
            weight_norm *= 2.20462;
        }

        var power_ctrl = pageView.powerController();
        var ftp = power_ctrl && power_ctrl.get('athlete_ftp');
        if (!ftp) {
            debugger;
        }
        var time_formatter = new Strava.I18n.TimespanFormatter();

        jQuery('#ses-critpower').show();
        CP_PERIODS.forEach(function(period) {
            var cp = critpower_smart(ts_stream, watts_stream, period[1]);
            var el = jQuery('#ses-cp-' + period[1]);
            if (cp === undefined) {
                jQuery('#ses-cp-row-' + period[1]).hide();
            } else {
                var cp_avg = cp.avg();
                var w_kg = (cp_avg / weight_kg).toFixed(1);
                el.html(Math.round(cp_avg) + '<attr class="unit">W</attr>');
                var np = calc_np(cp._values);
                var analysis_link = 'https://www.strava.com/activities/' + 
                                    pageView.activity().get('id') +
                                    '/analysis/' + cp._times[0] + '/' +
                                    cp._times[cp._times.length-1];
                var moreinfo = [
                    '<div title="Critical power - ', period[0], '"',
                           'class="ses-critpower-moreinfo">',
                        '<div class="ses-sparkline"></div>',
                        '<table>',
                            '<tr>',
                                '<td>Start time</td>',
                                '<td><a href="', analysis_link, '">', /* XXX: use routes */
                                time_formatter.display(cp._times[0]), '</a></td>',
                            '</tr>',
                            '<tr>',
                                '<td>Watts/kg</td>',
                                '<td>', w_kg, '</td>',
                            '</tr>',
                            '<tr>',
                                '<td>Peak power</td>',
                                '<td>', Math.max.apply(null, cp._values), 'w</td>',
                            '</tr>',
                            '<tr>',
                                '<td>Average power</td>',
                                '<td>', Math.round(cp_avg), 'w</td>',
                            '</tr>'
                ];
                if (np.value) {
                    moreinfo.push([
                        '<tr>',
                            '<td>Normalized power</td>',
                            '<td>', Math.round(np.value), 'w</td>',
                        '</tr>'
                    ].join(''));
                }
                if (ftp) {
                    var avgpwr = np.value ? np : {value: cp_avg, count: cp._values.length};
                    var if_ = avgpwr.value / ftp;
                    moreinfo.push([
                        '<tr>',
                            '<td>Intensity factor</td>',
                            '<td>', if_.toFixed(2), '</td>',
                        '</tr>',
                        '<tr>',
                            '<td>TSS</td>',
                            '<td>', Math.round(calc_tss(avgpwr, if_, ftp)), '</td>',
                        '</tr>',
                    ].join(''));
                }
                moreinfo.push('</div></table>');

                moreinfo = jQuery(moreinfo.join('')).dialog({
                    resizable: false,
                    modal: false,
                    autoOpen: false,
                    buttons: {
                        Close: function() { moreinfo.dialog('close'); }
                    }
                });
                el.click(function(x) {
                    moreinfo.dialog('open');
                    moreinfo.find('.ses-sparkline').sparkline(cp._values, {
                        type: 'line',
                        width: '100%',
                        height: 56,
                        lineColor: '#EA400D',
                        fillColor: 'rgba(234, 64, 13, 0.61)',
                        chartRangeMin: 0,
                        normalRangeMin: 0,
                        normalRangeMax: cp_avg,
                        tooltipSuffix: 'w'
                    });
                });
            }
        });

        if (power_ctrl) {
            var np = calc_np(watts_stream);
            if (!ftp) {
                jQuery('.ses-if').parent().parent().hide();
                jQuery('.ses-tss').parent().parent().hide();
            } else {
                var if_ = np.value / ftp;
                var tss = calc_tss(np, if_, ftp);
                jQuery('.ses-if').html(if_.toFixed(2));
                jQuery('.ses-tss').html(Math.round(tss));
            }
            jQuery('.ses-np').html(Math.round(np.value));
            jQuery('.ses-stats').show();
        } else {
            console.log("Skipping power stats for powerless activity.");
        }
        jQuery('.ses-weight-label').html(weight_unit);
        jQuery('.ses-weight').html(Math.round(weight_norm));
    }

    var critpower_smart = function(ts_stream, watts_stream, period) {
        var ring = new RollingAvg(period);
        var max = undefined;
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
            if (ring.full() && (!max || ring.avg() > max.avg())) {
                max = ring.copy();
            }
        }
        return max;
    }

    var calc_np = function(watts_stream) {
        var ret = {
            value: 0,
            count: 0
        };
        var rolling_size = 30;
        if (watts_stream.length < 120) {
            return ret;
        }
        var total = 0;
        var count = 0;
        var index = 0;
        var sum = 0;
        var rolling = new Uint16Array(rolling_size);
        for (var i = 0; i < watts_stream.length; i++) {
            var watts = watts_stream[i];
            sum += watts;
            sum -= rolling[index];
            rolling[index] = watts;
            total += Math.pow(sum / rolling_size, 4);
            count++;
            index = (index >= rolling_size - 1) ? 0 : index + 1;
        }
        if (count) {
            ret.value = Math.pow(total / count, 0.25);
            ret.count = count;
        }
        return ret;
    };

    /* NOTES:
     * zones: pageView.power().
     */
    var calc_tss = function(np, if_, ftp) {
        var norm_work = np.value * np.count;
        var ftp_work_hour = ftp * 3600;
        var raw_tss = norm_work * if_;
        return raw_tss / ftp_work_hour * 100;
    };

    var panel = [
        '<ul id="ses-critpower" style="display: none;" class="pagenav">',
            '<li class="group">',
                '<div class="title">Critical Power</div>',
                '<table>'
    ];
    CP_PERIODS.forEach(function(x) {
        var r = [
            '<tr id="ses-cp-row-', x[1], '">',
                '<td>', x[0], '</td>',
                '<td id="ses-cp-', x[1], '">...</td>',
            '</tr>'
        ];
        panel.push(r.join(''));
    });
    panel.push('</table></li></ul>');
    jQuery(panel.join('')).insertBefore('.actions-menu');

    var ses_stats = [
        '<ul style="display: none;" class="inline-stats section secondary-stats ses-stats">',
            '<li>',
                '<strong>',
                    '<span class="ses-np">...</span>',
                    '<abbr class="unit" title="watts">W</abbr>',
                '</strong>',
                '<div class="label">Normalized Power</div>',
            '</li>',
            '<li>',
                '<strong>',
                    '<span class="ses-if">...</span>',
                    '<abbr class="unit" title="Intesity Factor">IF</abbr>',
                '</strong>',
                '<div class="label">Intensity Factor</div>',
            '</li>',
            '<li>',
                '<strong>',
                    '<span class="ses-tss">...</span>',
                '</strong>',
                '<div class="label">TSS</div>',
            '</li>',
            '<li>',
                '<strong>',
                    '<span class="ses-weight">...</span>',
                    '<abbr class="unit ses-weight-label" title="Weight"></abbr>',
                '</strong>',
                '<div class="label">Weight</div>',
            '</li>',
        '</ul>'
    ];

    jQuery(ses_stats.join('')).insertAfter('.inline-stats.secondary-stats');

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

