import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function HomeScreen({ navigation }) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom:insets.bottom }]}>
        <View style={styles.content}>
            <Text style={styles.title}>randoro</Text>
            <View style={styles.divider} />
            <Text style={styles.tagline}>react to what you can't predict.</Text>
        </View>
        <TouchableOpacity style={styles.button} onPress={() => navigation.navigate('Setup')}>
            <Text style={styles.buttonText}>PREPARE</Text>
        </TouchableOpacity>
    </View>
  )
}


const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1C1C1E',
    paddingHorizontal: 40,
    justifyContent: 'space-between',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 52,
    fontWeight: '200',
    color: '#FFFFFF',
    letterSpacing: 4,
  },
  divider: {
    width: 40,
    height: 1,
    backgroundColor: '#FFFFFF',
    opacity: 0.3,
    marginVertical: 20,
  },
  tagline: {
    fontSize: 15,
    color: '#FFFFFF',
    opacity: 0.6,
    letterSpacing: 0.5,
  },
  button: {
    borderWidth: 2,
    borderColor: '#FFFFFF',
    borderRadius: 50,
    paddingVertical: 22,
    alignItems: 'center',
    marginBottom: 32,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '400',
    letterSpacing: 3,
  },
});
