/** Chart colors (the rest of the theme lives in CSS variables). */
export const chartColors = (dark: boolean) =>
  dark
    ? {
        income: '#4ADE80', expense: '#F87171', grid: '#232B42', label: '#94A3B8',
        slices: ['#818CF8', '#FBBF24', '#F472B6', '#64748B'],
      }
    : {
        income: '#16A34A', expense: '#DC2626', grid: '#E5E9F0', label: '#64748B',
        slices: ['#6366F1', '#F59E0B', '#EC4899', '#94A3B8'],
      };
