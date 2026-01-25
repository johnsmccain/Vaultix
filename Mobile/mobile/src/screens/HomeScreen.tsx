import React from 'react';
import { View, Text, StyleSheet, Button } from 'react-native';
import { theme } from '../utils/theme';
import { StellarService } from '../services/stellar';

export const HomeScreen = () => {
  const handleTestStellar = () => {
    StellarService.getInstance().createTestAccount();
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Welcome to Vaultix Mobile</Text>
      <Text style={styles.subtitle}>Secure Escrow Service</Text>
      <View style={styles.card}>
        <Text style={styles.cardText}>Latest Transactions</Text>
        <Text style={styles.bodyText}>No recent activity.</Text>
      </View>
      <Button title="Test Stellar Service" onPress={handleTestStellar} color={theme.colors.primary} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
    padding: theme.spacing.m,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: theme.typography.sizes.h1,
    fontWeight: 'bold',
    color: theme.colors.primary,
    marginBottom: theme.spacing.s,
  },
  subtitle: {
    fontSize: theme.typography.sizes.h2,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.xl,
  },
  card: {
    backgroundColor: theme.colors.surface,
    padding: theme.spacing.m,
    borderRadius: 8,
    width: '100%',
    marginBottom: theme.spacing.m,
  },
  cardText: {
    fontSize: theme.typography.sizes.h3,
    color: theme.colors.text,
    marginBottom: theme.spacing.s,
  },
  bodyText: {
    fontSize: theme.typography.sizes.body,
    color: theme.colors.textSecondary,
  },
});
