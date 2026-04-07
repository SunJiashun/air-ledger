import dayjs from 'dayjs';

export function formatAmount(amount: number): string {
  return amount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export function formatDate(date: string, format: string = 'YYYY-MM-DD'): string {
  return dayjs(date).format(format);
}

export function formatMonth(date: string): string {
  return dayjs(date).format('YYYY年M月');
}

export function getMonthRange(year: number, month: number): { start: string; end: string } {
  const start = dayjs().year(year).month(month).startOf('month').format('YYYY-MM-DD');
  const end = dayjs().year(year).month(month).endOf('month').format('YYYY-MM-DD');
  return { start, end };
}

export function getWeekRange(date: string): { start: string; end: string } {
  const d = dayjs(date);
  return {
    start: d.startOf('week').format('YYYY-MM-DD'),
    end: d.endOf('week').format('YYYY-MM-DD'),
  };
}

export function getYearRange(year: number): { start: string; end: string } {
  return {
    start: `${year}-01-01`,
    end: `${year}-12-31`,
  };
}
