const SEMITONES = {
  C: 0,
  "C#": 1,
  D: 2,
  "D#": 3,
  E: 4,
  F: 5,
  "F#": 6,
  G: 7,
  "G#": 8,
  A: 9,
  "A#": 10,
  B: 11
};

const PITCH_CLASSES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const WHITE_PITCH_CLASSES = new Set(["C", "D", "E", "F", "G", "A", "B"]);
const KEYBOARD_LAYOUT = [
  "A", "W", "S", "E", "D", "F", "T", "G", "Y", "H", "U", "J",
  "K", "O", "L", "P", ";", "'", "]", "Z", "\\", "X", "C", "V"
];
const START_MIDI = 21;
const END_MIDI = 108;
const WINDOW_SIZE = KEYBOARD_LAYOUT.length;
const WINDOW_STARTS = [21, 24, 36, 48, 60, 72, 84, 85];

const noteNamePattern = /^([A-G]#?)(-?\d)$/;

function getFrequency(noteName) {
  const match = noteName.match(noteNamePattern);
  if (!match) {
    throw new Error(`Unsupported note name: ${noteName}`);
  }

  const [, pitchClass, octaveText] = match;
  const octave = Number(octaveText);
  const midi = 12 * (octave + 1) + SEMITONES[pitchClass];
  return 440 * 2 ** ((midi - 69) / 12);
}

function midiToNoteName(midi) {
  const pitchClass = PITCH_CLASSES[midi % 12];
  const octave = Math.floor(midi / 12) - 1;
  return `${pitchClass}${octave}`;
}

function getNoteData(midi, whiteIndex) {
  const note = midiToNoteName(midi);
  const pitchClass = note.slice(0, -1);

  return {
    midi,
    note,
    freq: getFrequency(note),
    isWhite: WHITE_PITCH_CLASSES.has(pitchClass),
    whiteIndex
  };
}

function createKeyboardData() {
  const notes = [];
  let whiteIndex = 0;

  for (let midi = START_MIDI; midi <= END_MIDI; midi += 1) {
    const noteData = getNoteData(midi, whiteIndex);
    notes.push(noteData);
    if (noteData.isWhite) {
      whiteIndex += 1;
    }
  }

  return notes;
}

const pianoNotes = createKeyboardData();
const allNotes = new Map();

const keyboard = document.getElementById("keyboard");
const volumeSlider = document.getElementById("volume");
const decaySlider = document.getElementById("decay");
const toneSelect = document.getElementById("toneSelect");
const panicButton = document.getElementById("panic");
const octaveDownButton = document.getElementById("octaveDown");
const octaveUpButton = document.getElementById("octaveUp");
const octaveSelect = document.getElementById("octaveSelect");
const rangeLabel = document.getElementById("rangeLabel");
const whiteKeyTemplate = document.getElementById("white-key-template");
const blackKeyTemplate = document.getElementById("black-key-template");

const audioContext = new (window.AudioContext || window.webkitAudioContext)();
const masterGainNode = audioContext.createGain();
const activeNotes = new Map();
let masterVolume = Number(volumeSlider.value) / 100;
let decayTime = Number(decaySlider.value) / 1000;
let activeWindowStart = 60;
let activeTone = "piano";

masterGainNode.gain.value = masterVolume;
masterGainNode.connect(audioContext.destination);

const TONE_PRESETS = {
  piano: {
    peak: 0.9,
    sustain: 0.42,
    attack: 0.006,
    settle: 0.14,
    lowpassMultiplier: 7,
    lowpassMin: 1800,
    lowpassMax: 5200,
    bodyGain: 3,
    noiseLevel: 0.16,
    noiseDuration: 0.03,
    bandpassMultiplier: 9,
    bandpassMax: 4200,
    partials: [
      { ratio: 1, gain: 0.82, type: "triangle", detune: -1.5 },
      { ratio: 2, gain: 0.24, type: "sine", detune: 1.5 },
      { ratio: 3, gain: 0.11, type: "sine", detune: -0.8 }
    ]
  },
  mellow: {
    peak: 0.78,
    sustain: 0.5,
    attack: 0.01,
    settle: 0.22,
    lowpassMultiplier: 4.8,
    lowpassMin: 1200,
    lowpassMax: 3200,
    bodyGain: 2,
    noiseLevel: 0.07,
    noiseDuration: 0.022,
    bandpassMultiplier: 6,
    bandpassMax: 3000,
    partials: [
      { ratio: 1, gain: 0.9, type: "sine", detune: -0.4 },
      { ratio: 2, gain: 0.16, type: "triangle", detune: 0.6 },
      { ratio: 3, gain: 0.05, type: "sine", detune: 0 }
    ]
  },
  bright: {
    peak: 0.96,
    sustain: 0.36,
    attack: 0.004,
    settle: 0.1,
    lowpassMultiplier: 11,
    lowpassMin: 2400,
    lowpassMax: 7200,
    bodyGain: 4,
    noiseLevel: 0.18,
    noiseDuration: 0.026,
    bandpassMultiplier: 11,
    bandpassMax: 5200,
    partials: [
      { ratio: 1, gain: 0.74, type: "triangle", detune: -1 },
      { ratio: 2, gain: 0.33, type: "triangle", detune: 1.2 },
      { ratio: 4, gain: 0.12, type: "sine", detune: -0.3 }
    ]
  },
  organ: {
    peak: 0.72,
    sustain: 0.68,
    attack: 0.018,
    settle: 0.08,
    lowpassMultiplier: 9,
    lowpassMin: 2200,
    lowpassMax: 5600,
    bodyGain: 1.4,
    noiseLevel: 0.01,
    noiseDuration: 0.008,
    bandpassMultiplier: 5,
    bandpassMax: 2400,
    partials: [
      { ratio: 1, gain: 0.65, type: "sine", detune: 0 },
      { ratio: 2, gain: 0.38, type: "sine", detune: 0 },
      { ratio: 4, gain: 0.22, type: "sine", detune: 0 }
    ]
  },
  bell: {
    peak: 0.82,
    sustain: 0.24,
    attack: 0.003,
    settle: 0.09,
    lowpassMultiplier: 12,
    lowpassMin: 2600,
    lowpassMax: 7600,
    bodyGain: 2.2,
    noiseLevel: 0.03,
    noiseDuration: 0.01,
    bandpassMultiplier: 12,
    bandpassMax: 6200,
    partials: [
      { ratio: 1, gain: 0.5, type: "sine", detune: 0 },
      { ratio: 2.76, gain: 0.22, type: "sine", detune: 0.4 },
      { ratio: 5.4, gain: 0.1, type: "sine", detune: -0.2 }
    ]
  },
  synth: {
    peak: 0.88,
    sustain: 0.46,
    attack: 0.005,
    settle: 0.12,
    lowpassMultiplier: 8,
    lowpassMin: 2000,
    lowpassMax: 6000,
    bodyGain: 2.6,
    noiseLevel: 0.04,
    noiseDuration: 0.012,
    bandpassMultiplier: 8,
    bandpassMax: 3800,
    partials: [
      { ratio: 1, gain: 0.72, type: "sawtooth", detune: -2.2 },
      { ratio: 1.01, gain: 0.28, type: "sawtooth", detune: 2.2 },
      { ratio: 2, gain: 0.1, type: "triangle", detune: 0 }
    ]
  }
};

function getDynamicFilterFrequency(freq, preset) {
  return Math.min(preset.lowpassMax, Math.max(preset.lowpassMin, freq * preset.lowpassMultiplier));
}

function createPianoVoice(config, now) {
  const preset = TONE_PRESETS[activeTone] ?? TONE_PRESETS.piano;
  const output = audioContext.createGain();
  const toneFilter = audioContext.createBiquadFilter();
  const bodyFilter = audioContext.createBiquadFilter();
  const hammerGain = audioContext.createGain();
  const noiseBuffer = audioContext.createBuffer(1, Math.max(1, audioContext.sampleRate * 0.03), audioContext.sampleRate);
  const noiseData = noiseBuffer.getChannelData(0);

  for (let index = 0; index < noiseData.length; index += 1) {
    noiseData[index] = (Math.random() * 2 - 1) * 0.3;
  }

  output.gain.setValueAtTime(0.0001, now);
  output.gain.exponentialRampToValueAtTime(Math.max(preset.peak, 0.0001), now + preset.attack);
  output.gain.exponentialRampToValueAtTime(Math.max(preset.sustain, 0.0001), now + preset.settle);

  toneFilter.type = "lowpass";
  toneFilter.frequency.setValueAtTime(getDynamicFilterFrequency(config.freq, preset), now);
  toneFilter.Q.setValueAtTime(0.9, now);

  bodyFilter.type = "peaking";
  bodyFilter.frequency.setValueAtTime(Math.min(config.freq * 2, 1800), now);
  bodyFilter.Q.setValueAtTime(0.7, now);
  bodyFilter.gain.setValueAtTime(preset.bodyGain, now);

  const oscillators = preset.partials.map((partial) => {
    const oscillator = audioContext.createOscillator();
    const partialGain = audioContext.createGain();

    oscillator.type = partial.type;
    oscillator.frequency.setValueAtTime(config.freq * partial.ratio, now);
    oscillator.detune.setValueAtTime(partial.detune, now);

    partialGain.gain.setValueAtTime(partial.gain, now);
    oscillator.connect(partialGain);
    partialGain.connect(toneFilter);
    oscillator.start(now);

    return oscillator;
  });

  const hammerNoise = audioContext.createBufferSource();
  const hammerFilter = audioContext.createBiquadFilter();

  hammerNoise.buffer = noiseBuffer;

  hammerFilter.type = "bandpass";
  hammerFilter.frequency.setValueAtTime(Math.min(config.freq * preset.bandpassMultiplier, preset.bandpassMax), now);
  hammerFilter.Q.setValueAtTime(0.8, now);

  hammerGain.gain.setValueAtTime(preset.noiseLevel, now);
  hammerGain.gain.exponentialRampToValueAtTime(0.0001, now + preset.noiseDuration);

  hammerNoise.connect(hammerFilter);
  hammerFilter.connect(hammerGain);
  hammerGain.connect(toneFilter);

  hammerNoise.start(now);
  hammerNoise.stop(now + preset.noiseDuration + 0.005);

  toneFilter.connect(bodyFilter);
  bodyFilter.connect(output);
  output.connect(masterGainNode);

  return { oscillators, hammerNoise, output };
}

function createKeyElement(item, template, extraStyles = {}) {
  const keyElement = template.content.firstElementChild.cloneNode(true);
  keyElement.dataset.midi = item.midi;
  keyElement.dataset.note = item.note;
  keyElement.querySelector(".note-label").textContent = item.note;
  keyElement.querySelector(".key-label").textContent = "";
  Object.assign(keyElement.style, extraStyles);

  const releasePointerNote = (event) => {
    if (event.pointerId != null && keyElement.hasPointerCapture(event.pointerId)) {
      keyElement.releasePointerCapture(event.pointerId);
    }
    releaseNote(item.midi);
  };

  keyElement.addEventListener("pointerdown", (event) => {
    keyElement.setPointerCapture(event.pointerId);
    triggerNote(item.midi);
  });
  keyElement.addEventListener("pointerup", releasePointerNote);
  keyElement.addEventListener("pointercancel", releasePointerNote);
  keyElement.addEventListener("lostpointercapture", () => releaseNote(item.midi));
  return keyElement;
}

function renderKeyboard() {
  const keyboardStyles = getComputedStyle(keyboard);
  const whiteKeyWidth = parseFloat(keyboardStyles.getPropertyValue("--white-key-width"));
  const whiteKeyGap = parseFloat(keyboardStyles.getPropertyValue("--white-key-gap"));
  const blackKeyWidth = parseFloat(keyboardStyles.getPropertyValue("--black-key-width"));

  pianoNotes.forEach((item) => {
    const keyElement = item.isWhite
      ? createKeyElement(item, whiteKeyTemplate)
      : createKeyElement(item, blackKeyTemplate, {
          left: `${item.whiteIndex * (whiteKeyWidth + whiteKeyGap) - blackKeyWidth / 2 + whiteKeyGap / 2}px`
        });

    keyboard.appendChild(keyElement);
    allNotes.set(item.midi, { ...item, element: keyElement });
  });
}

function populateOctaveSelect() {
  WINDOW_STARTS.forEach((midi) => {
    const option = document.createElement("option");
    option.value = String(midi);
    option.textContent = midiToNoteName(midi);
    octaveSelect.appendChild(option);
  });
}

function updateRangeControls() {
  octaveSelect.value = String(activeWindowStart);
  rangeLabel.textContent = `${midiToNoteName(activeWindowStart)} to ${midiToNoteName(activeWindowStart + WINDOW_SIZE - 1)}`;

  const startIndex = WINDOW_STARTS.indexOf(activeWindowStart);
  octaveDownButton.disabled = startIndex <= 0;
  octaveUpButton.disabled = startIndex >= WINDOW_STARTS.length - 1;

  for (const noteData of allNotes.values()) {
    noteData.element.classList.remove("is-mapped");
    noteData.element.querySelector(".key-label").textContent = "";
  }

  KEYBOARD_LAYOUT.forEach((key, index) => {
    const noteData = allNotes.get(activeWindowStart + index);
    if (noteData) {
      noteData.element.classList.add("is-mapped");
      noteData.element.querySelector(".key-label").textContent = key;
    }
  });
}

function setActiveWindowStart(midi) {
  activeWindowStart = midi;
  updateRangeControls();
  allNotes.get(midi)?.element.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
}

function resumeAudio() {
  if (audioContext.state === "suspended") {
    audioContext.resume();
  }
}

function triggerNote(midi) {
  const config = allNotes.get(midi);
  if (!config || activeNotes.has(midi)) {
    return;
  }

  resumeAudio();

  const now = audioContext.currentTime;
  const voice = createPianoVoice(config, now);
  activeNotes.set(midi, voice);

  config.element.classList.add("is-active");
}

function releaseNote(midi) {
  const active = activeNotes.get(midi);
  if (!active) {
    return;
  }

  const now = audioContext.currentTime;
  active.output.gain.cancelScheduledValues(now);
  active.output.gain.setValueAtTime(Math.max(active.output.gain.value, 0.0001), now);
  active.output.gain.exponentialRampToValueAtTime(0.0001, now + decayTime);
  active.oscillators.forEach((oscillator) => oscillator.stop(now + decayTime + 0.08));

  activeNotes.delete(midi);

  allNotes.get(midi)?.element.classList.remove("is-active");
}

function stopAllNotes() {
  [...activeNotes.keys()].forEach(releaseNote);
}

function resolveMidiFromKeyboardKey(key) {
  const index = KEYBOARD_LAYOUT.findIndex((mappedKey) => mappedKey.toLowerCase() === key);
  if (index === -1) {
    return null;
  }

  const midi = activeWindowStart + index;
  return midi <= END_MIDI ? midi : null;
}

function isTypingTarget(target) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return target.isContentEditable || Boolean(target.closest("input, select, textarea, button, [contenteditable='true']"));
}

document.addEventListener("keydown", (event) => {
  if (event.repeat || isTypingTarget(event.target)) {
    return;
  }

  const midi = resolveMidiFromKeyboardKey(event.key.toLowerCase());
  if (midi === null) {
    return;
  }

  event.preventDefault();
  triggerNote(midi);
});

document.addEventListener("keyup", (event) => {
  if (isTypingTarget(event.target)) {
    return;
  }

  const midi = resolveMidiFromKeyboardKey(event.key.toLowerCase());
  if (midi === null) {
    return;
  }

  event.preventDefault();
  releaseNote(midi);
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    stopAllNotes();
  }
});

window.addEventListener("blur", stopAllNotes);
window.addEventListener("pagehide", stopAllNotes);

volumeSlider.addEventListener("input", (event) => {
  masterVolume = Number(event.target.value) / 100;
  masterGainNode.gain.setValueAtTime(masterVolume, audioContext.currentTime);
});

decaySlider.addEventListener("input", (event) => {
  decayTime = Number(event.target.value) / 1000;
});
toneSelect.addEventListener("change", (event) => {
  activeTone = event.target.value;
});

panicButton.addEventListener("click", stopAllNotes);
octaveSelect.addEventListener("change", (event) => {
  setActiveWindowStart(Number(event.target.value));
});
octaveDownButton.addEventListener("click", () => {
  const currentIndex = WINDOW_STARTS.indexOf(activeWindowStart);
  if (currentIndex > 0) {
    setActiveWindowStart(WINDOW_STARTS[currentIndex - 1]);
  }
});
octaveUpButton.addEventListener("click", () => {
  const currentIndex = WINDOW_STARTS.indexOf(activeWindowStart);
  if (currentIndex < WINDOW_STARTS.length - 1) {
    setActiveWindowStart(WINDOW_STARTS[currentIndex + 1]);
  }
});

renderKeyboard();
populateOctaveSelect();
setActiveWindowStart(activeWindowStart);
