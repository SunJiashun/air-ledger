import React, { createContext, useContext, ReactNode } from 'react';
import { morandiTheme } from './morandi';
import { darkTheme } from './dark';
import { useThemeStore } from '../stores/themeStore';

type Theme = {
  mode: 'light' | 'dark';
  colors: typeof morandiTheme.colors;
};

const ThemeContext = createContext<Theme>(morandiTheme as Theme);

export function useTheme() {
  return useContext(ThemeContext);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const mode = useThemeStore((s) => s.mode);
  const theme = (mode === 'dark' ? darkTheme : morandiTheme) as Theme;
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}
