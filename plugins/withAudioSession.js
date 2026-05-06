const { withAppDelegate } = require('@expo/config-plugins');

const BEGIN = '// randoro-audio-session-begin';
const END = '// randoro-audio-session-end';

const SWIFT_IMPORT = 'import AVFoundation';

const SWIFT_BODY = `    ${BEGIN}
    do {
      try AVAudioSession.sharedInstance().setCategory(
        .playback,
        mode: .default,
        options: []
      )
      try AVAudioSession.sharedInstance().setActive(true)
      let route = AVAudioSession.sharedInstance().currentRoute
      let outs = route.outputs.map { "\\($0.portType.rawValue):\\($0.portName)" }.joined(separator: ", ")
      NSLog("randoro-audio: category=playback options=[] outputs=[\\(outs)]")
    } catch {
      NSLog("randoro-audio: failed to configure AVAudioSession: \\(error.localizedDescription)")
    }
    ${END}`;

function withAudioSession(config) {
  return withAppDelegate(config, (cfg) => {
    let contents = cfg.modResults.contents;

    if (!contents.includes(SWIFT_IMPORT)) {
      contents = contents.replace(
        /^(import Expo)/m,
        `${SWIFT_IMPORT}\n$1`
      );
    }

    const blockRegex = new RegExp(
      `[ \\t]*${BEGIN}[\\s\\S]*?${END}\\n?`
    );

    if (blockRegex.test(contents)) {
      contents = contents.replace(blockRegex, `${SWIFT_BODY}\n`);
    } else {
      const anchor = /(didFinishLaunchingWithOptions launchOptions: \[UIApplication\.LaunchOptionsKey: Any\]\? = nil\s*\)\s*->\s*Bool\s*\{\s*\n)/;
      if (!anchor.test(contents)) {
        throw new Error(
          'withAudioSession: could not find didFinishLaunchingWithOptions in AppDelegate.swift'
        );
      }
      contents = contents.replace(anchor, `$1${SWIFT_BODY}\n`);
    }

    cfg.modResults.contents = contents;
    return cfg;
  });
}

module.exports = withAudioSession;
