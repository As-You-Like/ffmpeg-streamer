'use strict';

const express = require('express');
const router = express.Router();
const FR = require('ffmpeg-respawn');
const M4F = require('mp4frag');
const P2J = require('pipe2jpeg');
const packageJson = require('../package');
const title = `${packageJson.name} ver: ${packageJson.version}`;

function renderVideo(res, params) {
    res.render('video', {
        title: 'video',
        params: params
    });
}

router.get('/', function (req, res) {
    const app = req.app;
    if (!app.get('ffmpegVersion')) {
        res.render('install', {
            title: 'Dependency Error',
            subTitle: 'FFMPEG not found on system.',
            message: 'Would like to automatically install ffmpeg in the current directory?'
        });
        return;
    }
    const ffmpeg = app.get('ffmpeg');
    if (ffmpeg && ffmpeg.running) {
        renderVideo(res, ffmpeg.params);
        return;
    }
    res.render('index', {
        title: title,
        subTitle: `ffmpeg ver: ${app.get('ffmpegVersion')}`,
        message: 'Select parameters and enter rtsp url for the ip camera.'
    });
});

router.post('/', function (req, res) {
    const app = req.app;
    let ffmpeg = app.get('ffmpeg');
    if (ffmpeg && ffmpeg.running) {
        ffmpeg.stop();
    }
    switch (req.body.action) {
        case 'Install':
            const ffbinaries = require('ffbinaries');
            ffbinaries.downloadFiles('ffmpeg', {quiet: true, destination: app.get('dirName')}, function (err, data) {
                console.log('Installing ffmpeg...');
                if (err) {
                    console.error(err);
                    res.render('error', {
                        message: 'Ffmpeg installation failure',
                        status: err,
                        stack: ''
                    });
                    return;
                }
                const configure = require('../lib/configure');
                res.render('index', {
                    title: title,
                    subTitle: `ffmpeg ver: ${configure(app).ffmpegVersion}`,
                    message: 'Select parameters and enter rtsp url for the ip camera.'
                });
            });
            break;
        case 'Exit':
            process.exit(0);
            break;
        case 'Stop':
            res.render('index', {
                title: title,
                subTitle: `ffmpeg ver: ${app.get('ffmpegVersion')}`,
                message: 'Select parameters and enter rtsp url for the ip camera.'
            });
            break;
        case 'Start':
            if (!req.body.rtsp) {
                res.render('index', {
                    title: title,
                    subTitle: `ffmpeg version: ${app.get('ffmpegVersion')}`,
                    message: '**ERROR** Missing rtsp url.'
                });
                return;
            }
            const logLevel = req.body.loglevel;
            const arr = [/*'-use_wallclock_as_timestamps', '1'*/];
            const analyzeduration = req.body.analyzeduration;
            if (analyzeduration) {
                arr.push(...['-analyzeduration', analyzeduration]);
            }
            const probesize = req.body.probesize;
            if (probesize) {
                arr.push(...['-probesize', probesize]);
            }
            const hwaccel = req.body.hwaccel;
            if (hwaccel) {
                arr.push(...['-hwaccel', hwaccel]);
            }
            const rtspTransport = req.body.rtspTransport;
            if (rtspTransport) {
                arr.push(...['-rtsp_transport', rtspTransport]);
            }
            //todo some regex here to atleast make sure beginns with rtsp
            arr.push(...['-i', req.body.rtsp]);
            const ca = req.body.ca;
            if (ca === 'an') {
                arr.push('-an');
            } else {
                arr.push(...['-c:a', ca]);
            }
            const cv = req.body.cv;
            if (cv !== 'copy') {
                arr.push(...['-c:v', cv]);
                const rate = req.body.rate;
                const scale = req.body.scale;
                arr.push(...['-vf', `fps=${rate},scale=trunc(iw*${scale}/2)*2:-2,format=yuv420p`]);
                const fragDuration = req.body.fragDuration;
                if (fragDuration) {
                    arr.push(...['-min_frag_duration', fragDuration, '-frag_duration', fragDuration]);
                }
                const crf = req.body.crf;
                if (crf) {
                    arr.push(...['-crf', crf]);
                }
                const tune = req.body.tune;
                if (tune) {
                    arr.push(...['-tune', tune]);
                }
                const profile = req.body.profile;
                switch (profile) {
                    case 'baseline30' :
                        arr.push(...['-profile:v', 'baseline', '-level', '3.0']);
                        break;
                    case 'baseline31' :
                        arr.push(...['-profile:v', 'baseline', '-level', '3.1']);
                        break;
                    case 'main31' :
                        arr.push(...['-profile:v', 'main', '-level', '3.1']);
                        break;
                    case 'main40':
                        arr.push(...['-profile:v', 'main', '-level', '4.0']);
                        break;
                    case 'high40' :
                        arr.push(...['-profile:v', 'high', '-level', '4.0']);
                        break;
                    case 'high41':
                        arr.push(...['-profile:v', 'high', '-level', '4.1']);
                        break;
                    case 'high42' :
                        arr.push(...['-profile:v', 'high', '-level', '4.2']);
                        break;
                }
            } else {
                arr.push(...['-c:v', cv]);
            }
            arr.push(...['-f', 'mp4', '-movflags', '+frag_keyframe+empty_moov+default_base_moof+omit_tfhd_offset', '-reset_timestamps', '1', 'pipe:1']);
            const mp4frag = new M4F({hlsBase: 'test', hlsListSize: 4});
            app.set('mp4frag', mp4frag);
            const pipe2jpeg = new P2J();
            app.set('pipe2jpeg', pipe2jpeg);
            //if (req.body.params) {
            //todo process extra params to pass to ffmpeg
            //}
            const params = [
                '-an', '-c:v', 'mjpeg', '-f', 'image2pipe', '-huffman', 'optimal', '-q:v', '4', '-vf', 'fps=7,scale=640:-1', 'pipe:4'
            ];
            params.unshift(...arr);
            //console.log(params);
            try {
                ffmpeg = new FR(
                    {
                        path: 'ffmpeg',
                        params: params,
                        logLevel: logLevel,
                        pipes: [
                            {stdioIndex: 1, destination: mp4frag},
                            {stdioIndex: 4, destination: pipe2jpeg}
                        ],
                        killAfterStall: 60,
                        spawnAfterExit: 1,
                        reSpawnLimit: 10000,
                        logCallback: (data) => {
                            console.log(data.toString());
                        },
                        exitCallback: () => {
                            mp4frag.resetCache();
                        }
                    })
                    .start();
            } catch (error) {
                res.render('index', {
                    title: title,
                    subTitle: `ffmpeg ver: ${app.get('ffmpegVersion')}`,
                    message: error.message
                });
                return;
            }
            app.set('ffmpeg', ffmpeg);
            renderVideo(res, ffmpeg.params);
            break;
    }
});

module.exports = router;