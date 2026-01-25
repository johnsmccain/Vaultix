import React from 'react';
import { View, Text, StyleSheet, FlatList } from 'react-native';
import { theme } from '../utils/theme';

const MOCK_ESCROWS = [
  { id: '1', title: 'Web Development Project', amount: '500 XLM', status: 'Active' },
  { id: '2', title: 'Logo Design', amount: '150 XLM', status: 'Pending' },
  { id: '3', title: 'Content Writing', amount: '200 XLM', status: 'Completed' },
];

export const EscrowsScreen = () => {
  return (
    <View style={styles.container}>
      <Text style={styles.header}>My Escrows</Text>
      <FlatList
        data={MOCK_ESCROWS}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.item}>
            <View style={styles.row}>
              <Text style={styles.itemTitle}>{item.title}</Text>
              <Text style={styles.itemAmount}>{item.amount}</Text>
            </View>
            <Text style={[styles.status, item.status === 'Active' ? styles.statusActive : styles.statusPending]}>
              {item.status}
            </Text>
          </View>
        )}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
    padding: theme.spacing.m,
  },
  header: {
    fontSize: theme.typography.sizes.h1,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginBottom: theme.spacing.m,
  },
  item: {
    backgroundColor: theme.colors.surface,
    padding: theme.spacing.m,
    borderRadius: 8,
    marginBottom: theme.spacing.s,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.xs,
  },
  itemTitle: {
    fontSize: theme.typography.sizes.body,
    fontWeight: '600',
    color: theme.colors.text,
  },
  itemAmount: {
    fontSize: theme.typography.sizes.body,
    fontWeight: 'bold',
    color: theme.colors.primary,
  },
  status: {
    fontSize: theme.typography.sizes.caption,
  },
  statusActive: {
    color: theme.colors.success,
  },
  statusPending: {
    color: theme.colors.warning,
  },
});
