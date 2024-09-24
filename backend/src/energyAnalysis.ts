/** @format */

export interface EnergyData {
  date: string;
  consumption: number;
}

export function analyzeTrend(data: EnergyData[]): string {
  if (data.length < 2) return "Not enough data";

  const sortedData = data.sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );
  const firstValue = sortedData[0].consumption;
  const lastValue = sortedData[sortedData.length - 1].consumption;

  if (lastValue > firstValue) return "Increasing";
  if (lastValue < firstValue) return "Decreasing";
  return "Stable";
}
