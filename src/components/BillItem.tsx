import React, { useRef } from 'react';
import { View, Text, StyleSheet, Animated as RNAnimated } from 'react-native';
import { Swipeable, RectButton } from 'react-native-gesture-handler';
import { useTheme } from '../theme/ThemeProvider';
import type { BillWithCategory } from '../db/billDao';

interface BillItemProps {
  bill: BillWithCategory;
  onEdit: (bill: BillWithCategory) => void;
  onDelete: (id: string) => void;
}

export default function BillItem({ bill, onEdit, onDelete }: BillItemProps) {
  const { colors } = useTheme();
  const swipeableRef = useRef<Swipeable>(null);

  const isIncome = bill.type === 'income';
  const amountColor = isIncome ? colors.income : colors.expense;
  const amountPrefix = isIncome ? '+' : '-';
  const formattedAmount = `${amountPrefix}\u00A5${bill.amount.toFixed(2)}`;

  const renderRightActions = (
    progress: RNAnimated.AnimatedInterpolation<number>,
    _dragX: RNAnimated.AnimatedInterpolation<number>,
  ) => {
    const translateX = progress.interpolate({
      inputRange: [0, 1],
      outputRange: [160, 0],
    });

    return (
      <RNAnimated.View style={[styles.actionsContainer, { transform: [{ translateX }] }]}>
        <RectButton
          style={[styles.actionButton, { backgroundColor: colors.primary }]}
          onPress={() => {
            swipeableRef.current?.close();
            onEdit(bill);
          }}
        >
          <Text style={styles.actionText}>编辑</Text>
        </RectButton>
        <RectButton
          style={[styles.actionButton, { backgroundColor: colors.danger }]}
          onPress={() => {
            swipeableRef.current?.close();
            onDelete(bill.id);
          }}
        >
          <Text style={styles.actionText}>删除</Text>
        </RectButton>
      </RNAnimated.View>
    );
  };

  return (
    <Swipeable
      ref={swipeableRef}
      renderRightActions={renderRightActions}
      rightThreshold={40}
      overshootRight={false}
    >
      <View style={[styles.container, { backgroundColor: colors.card }]}>
        <View style={[styles.iconContainer, { backgroundColor: bill.categoryColor || colors.primaryLight }]}>
          <Text style={styles.icon}>{bill.categoryIcon || '📦'}</Text>
        </View>
        <View style={styles.content}>
          <Text style={[styles.categoryName, { color: colors.text }]} numberOfLines={1}>
            {bill.categoryName || '未分类'}
          </Text>
          {bill.note ? (
            <Text style={[styles.note, { color: colors.textSecondary }]} numberOfLines={1}>
              {bill.note}
            </Text>
          ) : null}
        </View>
        <Text style={[styles.amount, { color: amountColor }]}>
          {formattedAmount}
        </Text>
      </View>
    </Swipeable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    fontSize: 20,
  },
  content: {
    flex: 1,
    marginLeft: 12,
  },
  categoryName: {
    fontSize: 15,
    fontWeight: '500',
  },
  note: {
    fontSize: 12,
    marginTop: 2,
  },
  amount: {
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  actionsContainer: {
    flexDirection: 'row',
    width: 160,
  },
  actionButton: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    width: 80,
  },
  actionText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
});
