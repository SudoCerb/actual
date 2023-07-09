import React from 'react';

import * as d from 'date-fns';
import {
  VictoryChart,
  VictoryBar,
  VictoryLine,
  VictoryAxis,
  VictoryVoronoiContainer,
  VictoryGroup,
  VictoryStack,
} from 'victory';

import { colors } from '../../../style';
import theme from '../chart-theme';
import Container from '../Container';
import Tooltip from '../Tooltip';

type CashFlowGraphProps = {
  graphData: {
    expenses;
    expenses_uncleared;
    income;
    income_uncleared;
    balances;
  };
  isConcise: boolean;
};
function CashFlowGraph({ graphData, isConcise }: CashFlowGraphProps) {
  return (
    <Container>
      {(width, height, portalHost) =>
        graphData && (
          <VictoryChart
            scale={{ x: 'time', y: 'linear' }}
            theme={theme}
            domainPadding={10}
            width={width}
            height={height}
            containerComponent={
              <VictoryVoronoiContainer voronoiDimension="x" />
            }
          >
            <VictoryGroup>
              <VictoryStack>
                <VictoryBar
                  data={graphData.expenses_uncleared}
                  style={{ data: { fill: theme.colors.purple } }}
                />
                <VictoryBar
                  data={graphData.income_uncleared}
                  style={{ data: { fill: theme.colors.green } }}
                />
                <VictoryBar
                  data={graphData.expenses}
                  style={{ data: { fill: theme.colors.red } }}
                />
                <VictoryBar data={graphData.income} />
              </VictoryStack>
            </VictoryGroup>
            <VictoryLine
              data={graphData.balances}
              labelComponent={<Tooltip portalHost={portalHost} />}
              labels={x => x.premadeLabel}
              style={{
                data: { stroke: colors.n5 },
              }}
            />
            <VictoryAxis
              // eslint-disable-next-line rulesdir/typography
              tickFormat={x => d.format(x, isConcise ? "MMM ''yy" : 'MMM d')}
              tickValues={graphData.balances.map(item => item.x)}
              tickCount={Math.min(5, graphData.balances.length)}
              offsetY={50}
            />
            <VictoryAxis dependentAxis crossAxis={false} />
          </VictoryChart>
        )
      }
    </Container>
  );
}

export default CashFlowGraph;
