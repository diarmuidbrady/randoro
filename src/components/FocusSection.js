import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Pressable,
  ScrollView,
  Modal,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
} from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { useAudioPlayer } from 'expo-audio';
import { CallShape, SpeakerIcon, VerticalRule } from './CallShape';
import { CALL_RED } from '../constants/theme';
import {
  COMBO_LENGTHS,
  MAX_CALLS,
  BETWEEN_BEEPS_MAX,
  PRESET_COMBOS,
  parseCombo,
  callKey,
} from '../utils/combo';

export const newCall = () => ({
  id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  length: 0,
  combo: '',
});

const DELETE_WIDTH = 88;

// The calls the user throws on each beep, and what they work on between calls.
export default function FocusSection({ calls, onChangeCalls, betweenBeeps, onChangeBetween, onHelp, onCallAdded, target }) {
  const [editing, setEditing] = useState(null); // id of the call whose combo is open

  // Each call's speaker previews its sound.
  const players = {
    classic: useAudioPlayer(require('../../assets/sounds/classic.wav')),
    a: useAudioPlayer(require('../../assets/sounds/a.wav')),
    b: useAudioPlayer(require('../../assets/sounds/b.wav')),
    c: useAudioPlayer(require('../../assets/sounds/c.wav')),
  };
  const preview = useCallback(async (key) => {
    try {
      // Await the rewind, or play can run first and the sound is dropped.
      await players[key].seekTo(0);
      players[key].play();
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [players.classic, players.a, players.b, players.c]);

  const updateCall = (id, patch) =>
    onChangeCalls(calls.map(c => (c.id === id ? { ...c, ...patch } : c)));

  const addCall = () => {
    if (calls.length >= MAX_CALLS) return;
    onChangeCalls([...calls, newCall()]);
    onCallAdded?.();
  };

  // Later rows move up and re-letter; one left becomes Classic again.
  const removeCall = (id) => {
    if (calls.length > 1) onChangeCalls(calls.filter(c => c.id !== id));
  };

  const editingCall = calls.find(c => c.id === editing);

  return (
    <View style={styles.card}>
      <View style={styles.rows} ref={target('calls')} collapsable={false}>
        <Text style={[styles.textLabel, styles.rowsLabel]}>On the call</Text>
        {calls.map((call, i) => (
          <CallRow
            key={call.id}
            call={call}
            callKey={callKey(i, calls.length)}
            first={i === 0}
            removable={calls.length > 1}
            onPreview={preview}
            onCycle={() => updateCall(call.id, { length: (call.length + 1) % COMBO_LENGTHS.length })}
            onEdit={() => setEditing(call.id)}
            onRemove={() => removeCall(call.id)}
            onHelp={onHelp}
            target={target}
          />
        ))}

        {calls.length < MAX_CALLS && (
          <TouchableOpacity
            ref={target('addCall')}
            collapsable={false}
            style={styles.addRow}
            onPress={addCall}
            accessibilityRole="button"
            accessibilityLabel={calls.length === 1 ? 'Add a second call' : 'Add a third call'}
          >
            <Text maxFontSizeMultiplier={2} style={styles.addText}>+</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.divider} />

      <View style={styles.betweenBlock} ref={target('betweenBeeps')} collapsable={false}>
        <Text style={styles.textLabel}>Between calls</Text>
        <TextInput
          style={styles.textBox}
          value={betweenBeeps}
          onChangeText={onChangeBetween}
          placeholder="e.g. footwork, feints, head movement"
          placeholderTextColor="#9CA3AF"
          maxLength={BETWEEN_BEEPS_MAX}
          returnKeyType="done"
          accessibilityLabel="Between calls"
        />
      </View>

      {editingCall && (
        <ComboEditor
          call={editingCall}
          label={callLabel(callKey(calls.indexOf(editingCall), calls.length))}
          onSave={(combo) => {
            updateCall(editingCall.id, { combo });
            setEditing(null);
          }}
        />
      )}
    </View>
  );
}

const callLabel = (key) => (key === 'classic' ? 'Classic' : key.toUpperCase());

function CallRow({ call, callKey: key, first, removable, onPreview, onCycle, onEdit, onRemove, onHelp, target }) {
  const moves = parseCombo(call.combo);
  const custom = moves.length > 0;
  const label = callLabel(key);

  const row = (
    <View style={styles.row}>
      <View style={styles.rowMain}>
        <View style={styles.rowLeft}>
          {key === 'classic'
            ? <Text maxFontSizeMultiplier={2} style={styles.classicLabel}>Classic</Text>
            : <CallShape call={key} size={30} color={CALL_RED} />}
          <TouchableOpacity
            ref={first ? target('speaker') : undefined}
            collapsable={false}
            onPress={() => onPreview(key)}
            style={styles.speaker}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={`Play the ${label} call`}
          >
            <SpeakerIcon size={20} color="#6B7280" />
          </TouchableOpacity>
        </View>

        <DashedLine />

        <Pressable
          ref={first ? target('comboSide') : undefined}
          collapsable={false}
          style={({ pressed }) => [styles.rowRight, pressed && styles.pressed]}
          onPress={custom ? onEdit : onCycle}
          onLongPress={onEdit}
          delayLongPress={350}
          accessibilityRole="button"
          accessibilityLabel={`${label} combo: ${custom ? moves.join(', ') : COMBO_LENGTHS[call.length].label}`}
          accessibilityHint={custom ? 'Opens the combo' : 'Changes the combo length. Hold to type your own combo.'}
          accessibilityActions={[{ name: 'longpress', label: 'Type your own combo' }]}
          onAccessibilityAction={onEdit}
        >
          <Text numberOfLines={1} maxFontSizeMultiplier={2} style={styles.comboText}>
            {custom ? 'Custom combo' : COMBO_LENGTHS[call.length].label}
          </Text>
          <TouchableOpacity
            onPress={() => onHelp('combo')}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="What goes here"
          >
            <View style={styles.infoButton}>
              <Text allowFontScaling={false} style={styles.infoText}>i</Text>
            </View>
          </TouchableOpacity>
        </Pressable>
      </View>

      {custom && (
        <View style={styles.rowChips}>
          <Chips moves={moves} />
        </View>
      )}
    </View>
  );

  if (!removable) return row;

  return (
    <Swipeable
      friction={1.5}
      rightThreshold={DELETE_WIDTH / 2}
      overshootRight={false}
      onSwipeableWillOpen={onRemove}
      renderRightActions={() => (
        <View style={styles.deleteAction}>
          <Text style={styles.deleteText}>Delete</Text>
        </View>
      )}
      containerStyle={styles.swipeContainer}
    >
      <View
        accessible={false}
        accessibilityActions={[{ name: 'delete', label: `Remove call ${label}` }]}
        onAccessibilityAction={(e) => { if (e.nativeEvent.actionName === 'delete') onRemove(); }}
      >
        {row}
      </View>
    </Swipeable>
  );
}

function DashedLine() {
  return (
    <View style={styles.dashed}>
      <VerticalRule color="#D1D5DB" />
    </View>
  );
}

// The moves of a combo as small chips: 1 · 2 · pivot hook
export function Chips({ moves, light }) {
  return (
    <View style={styles.chips}>
      {moves.map((move, i) => (
        <React.Fragment key={i}>
          {i > 0 && <Text style={[styles.chipDot, light && styles.chipDotLight]}>·</Text>}
          <View style={[styles.chip, light && styles.chipLight]}>
            <Text maxFontSizeMultiplier={2} style={[styles.chipText, light && styles.chipTextLight]}>{move}</Text>
          </View>
        </React.Fragment>
      ))}
    </View>
  );
}

// The user types a combo or picks one. Tapping outside saves it.
function ComboEditor({ call, label, onSave }) {
  const [text, setText] = useState(call.combo);
  const moves = parseCombo(text);
  const save = () => onSave(moves.length > 0 ? text.trim() : '');

  return (
    <Modal visible transparent animationType="fade" onRequestClose={save}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.editorFill}>
        <Pressable style={styles.editorOverlay} onPress={save} accessibilityLabel="Save combo" accessibilityRole="button">
          {/* Taps inside the box don't reach the overlay. */}
          <Pressable style={styles.editorBox} onPress={() => {}} accessible={false}>
            <Text style={styles.editorTitle}>{label === 'Classic' ? 'Your combo' : `Combo for ${label}`}</Text>
            <TextInput
              style={styles.editorInput}
              value={text}
              onChangeText={setText}
              placeholder="e.g. jab, cross, slip"
              placeholderTextColor="#9CA3AF"
              autoFocus
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="done"
              onSubmitEditing={save}
              accessibilityLabel="Combo"
            />
            <View style={styles.preview}>
              {moves.length > 0 ? (
                <>
                  <Chips moves={moves} />
                  <Text style={styles.moveCount}>{moves.length} {moves.length === 1 ? 'move' : 'moves'}</Text>
                </>
              ) : (
                <Text style={styles.moveCount}>Separate moves with commas or dashes.</Text>
              )}
            </View>
            <ScrollView style={styles.presetList} keyboardShouldPersistTaps="handled">
              {PRESET_COMBOS.map(combo => (
                <TouchableOpacity
                  key={combo}
                  style={styles.presetRow}
                  onPress={() => setText(combo)}
                  accessibilityRole="button"
                >
                  <Text style={styles.presetText}>{combo}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  card: {
    overflow: 'hidden',
  },
  rows: {
    paddingHorizontal: 12,
    paddingBottom: 12,
    gap: 8,
  },
  swipeContainer: {
    borderRadius: 12,
  },
  row: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  rowMain: {
    flexDirection: 'row',
    alignItems: 'stretch',
    minHeight: 52,
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingLeft: 14,
    paddingRight: 10,
    paddingVertical: 8,
  },
  classicLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#111827',
  },
  speaker: {
    padding: 4,
  },
  dashed: {
    width: 2,
    marginVertical: 8,
  },
  rowRight: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingLeft: 12,
    paddingRight: 12,
    paddingVertical: 8,
    borderTopRightRadius: 12,
    borderBottomRightRadius: 12,
  },
  pressed: {
    backgroundColor: '#F4F5F7',
  },
  comboText: {
    flexShrink: 1,
    fontSize: 14,
    fontWeight: '400',
    color: '#111827',
  },
  infoButton: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#9CA3AF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoText: {
    fontSize: 12,
    fontWeight: '700',
    fontStyle: 'italic',
    color: '#9CA3AF',
  },
  rowChips: {
    paddingHorizontal: 14,
    paddingBottom: 12,
  },
  deleteAction: {
    width: DELETE_WIDTH,
    marginLeft: 8,
    borderRadius: 12,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 15,
  },
  addRow: {
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#D1D5DB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addText: {
    fontSize: 24,
    fontWeight: '400',
    color: '#6B7280',
  },
  divider: {
    height: 1,
    backgroundColor: '#E5E7EB',
    marginHorizontal: 16,
  },
  betweenBlock: {
    padding: 16,
    gap: 8,
  },
  // Larger than the call rows and typed text under it (14).
  textLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#374151',
  },
  rowsLabel: {
    paddingLeft: 4,
  },
  textBox: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#111827',
    backgroundColor: '#FFFFFF',
  },

  // Chips
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 4,
  },
  chip: {
    backgroundColor: '#E5E7EB',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  chipLight: {
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#111827',
  },
  chipTextLight: {
    color: '#FFFFFF',
  },
  chipDot: {
    fontSize: 13,
    color: '#9CA3AF',
  },
  chipDotLight: {
    color: 'rgba(255,255,255,0.7)',
  },

  // Combo editor
  editorFill: {
    flex: 1,
  },
  editorOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  editorBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    gap: 12,
    maxHeight: '80%',
  },
  editorTitle: {
    fontSize: 13,
    fontWeight: '500',
    color: '#6B7280',
  },
  editorInput: {
    borderWidth: 1.5,
    borderColor: '#111827',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 17,
    color: '#111827',
  },
  preview: {
    gap: 6,
    minHeight: 24,
  },
  moveCount: {
    fontSize: 13,
    color: '#6B7280',
  },
  presetList: {
    maxHeight: 200,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  presetRow: {
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  presetText: {
    fontSize: 15,
    color: '#374151',
  },
});
