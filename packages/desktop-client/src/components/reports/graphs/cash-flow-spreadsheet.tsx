import React from 'react';

import * as d from 'date-fns';

import q from 'loot-core/src/client/query-helpers';
import { send } from 'loot-core/src/platform/client/fetch';
import * as monthUtils from 'loot-core/src/shared/months';
import { integerToCurrency, integerToAmount } from 'loot-core/src/shared/util';

import { AlignedText } from '../../common';
import { fromDateRepr, fromDateReprToDay, runAll, index } from '../util';

export function simpleCashFlow(start, end) {
  return async (spreadsheet, setData) => {
    function makeQuery() {
      return q('transactions')
        .filter({
          $and: [{ date: { $gte: start } }, { date: { $lte: end } }],
          'account.offbudget': false,
          $or: [
            {
              'payee.transfer_acct.offbudget': true,
              'payee.transfer_acct': null,
            },
          ],
        })
        .calculate({ $sum: '$amount' });
    }

    return runAll(
      [
        makeQuery().filter({ amount: { $gt: 0 } }),
        makeQuery().filter({ amount: { $lt: 0 } }),
      ],
      data => {
        setData({
          graphData: {
            income: data[0],
            expense: data[1],
          },
        });
      },
    );
  };
}

export function cashFlowByDate(
  start,
  end,
  isConcise,
  // includeUncleared,
  conditions = [],
  conditionsOp,
) {
  return async (spreadsheet, setData) => {
    let { filters } = await send('make-filters-from-conditions', {
      conditions: conditions.filter(cond => !cond.customName),
    });
    const conditionsOpKey = conditionsOp === 'or' ? '$or' : '$and';

    function makeQuery(where) {
      let query = q('transactions')
        .filter({
          [conditionsOpKey]: [...filters],
        })
        .filter({
          $and: [
            { date: { $transform: '$month', $gte: start } },
            { date: { $transform: '$month', $lte: end } },
          ],
          'account.offbudget': false,
          $or: [
            {
              'payee.transfer_acct.offbudget': true,
              'payee.transfer_acct': null,
            },
          ],
        });

      if (isConcise) {
        return query
          .groupBy({ $month: '$date' })
          .select([
            { date: { $month: '$date' } },
            { amount: { $sum: '$amount' } },
          ]);
      }

      return query
        .groupBy('date')
        .select(['date', { amount: { $sum: '$amount' } }]);
    }

    return runAll(
      [
        q('transactions')
          .filter({
            [conditionsOpKey]: filters,
            date: { $transform: '$month', $lt: start },
            'account.offbudget': false,
          })
          .calculate({ $sum: '$amount' }),
        makeQuery('amount > 0 & uncleared').filter({
          amount: { $gt: 0 },
          cleared: { $eq: false },
        }),
        makeQuery('amount > 0 & cleared').filter({
          amount: { $gt: 0 },
          cleared: { $eq: true },
        }),
        makeQuery('amount < 0 & uncleared').filter({
          amount: { $lt: 0 },
          cleared: { $eq: false },
        }),
        makeQuery('amount < 0 & cleared').filter({
          amount: { $lt: 0 },
          cleared: { $eq: true },
        }),
      ],
      data => {
        setData(recalculate(data, start, end, isConcise));
      },
    );
  };
}

function recalculate(data, start, end, isConcise) {
  let [
    startingBalance,
    income_uncleared,
    income_cleared,
    expense_uncleared,
    expense_cleared,
  ] = data;
  const dates = isConcise
    ? monthUtils.rangeInclusive(
        monthUtils.getMonth(start),
        monthUtils.getMonth(end),
      )
    : monthUtils.dayRangeInclusive(start, end);
  const incomes = index(
    income_cleared,
    'date',
    isConcise ? fromDateRepr : fromDateReprToDay,
  );
  const incomes_uncleared = index(
    income_uncleared,
    'date',
    isConcise ? fromDateRepr : fromDateReprToDay,
  );
  const expenses = index(
    expense_cleared,
    'date',
    isConcise ? fromDateRepr : fromDateReprToDay,
  );
  const expenses_uncleared = index(
    expense_uncleared,
    'date',
    isConcise ? fromDateRepr : fromDateReprToDay,
  );

  let balance = startingBalance;
  let totalExpenses = 0;
  let totalIncome = 0;
  const graphData = dates.reduce(
    (res, date) => {
      let income = 0;
      let income_uncleared = 0;
      let expense = 0;
      let expense_uncleared = 0;

      if (incomes[date]) {
        income = incomes[date].amount;
      }
      if (incomes_uncleared[date]) {
        income_uncleared = incomes_uncleared[date].amount;
      }
      if (expenses[date]) {
        expense = expenses[date].amount;
      }
      if (expenses_uncleared[date]) {
        expense_uncleared = expenses_uncleared[date].amount;
      }

      totalExpenses += expense;
      totalExpenses += expense_uncleared;
      totalIncome += income;
      totalIncome += income_uncleared;
      balance += income + expense + income_uncleared + expense_uncleared;
      const x = d.parseISO(date);

      const label = (
        <div>
          <div style={{ marginBottom: 10 }}>
            <strong>
              {d.format(x, isConcise ? 'MMMM yyyy' : 'MMMM d, yyyy')}
            </strong>
          </div>
          <div style={{ lineHeight: 1.5 }}>
            <AlignedText left="Income:" right={integerToCurrency(income)} />
            <AlignedText left="Expenses:" right={integerToCurrency(expense)} />
            <AlignedText
              left="Change:"
              right={<strong>{integerToCurrency(income + expense)}</strong>}
            />
            <AlignedText left="Balance:" right={integerToCurrency(balance)} />
          </div>
        </div>
      );

      res.income.push({ x, y: integerToAmount(income) });
      res.income_uncleared.push({ x, y: integerToAmount(income_uncleared) });
      res.expenses.push({ x, y: integerToAmount(expense) });
      res.expenses_uncleared.push({ x, y: integerToAmount(expense_uncleared) });
      res.balances.push({
        x,
        y: integerToAmount(balance),
        premadeLabel: label,
        amount: balance,
      });
      return res;
    },
    {
      expenses: [],
      expenses_uncleared: [],
      income: [],
      income_uncleared: [],
      balances: [],
    },
  );

  const { balances } = graphData;

  return {
    graphData,
    balance: balances[balances.length - 1].amount,
    totalExpenses,
    totalIncome,
    totalChange: balances[balances.length - 1].amount - balances[0].amount,
  };
}
