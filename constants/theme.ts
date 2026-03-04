// Iron Eagle Security Brand Colors - Light Mode
export const lightColors = {
  primary: '#FF9500', // Orange - primary actions
  primaryDark: '#E67E00', // Darker orange for pressed states
  secondary: '#00D9FF', // Electric blue/cyan - secondary actions
  secondaryDark: '#00B8D4', // Darker cyan for pressed states
  accent: '#FFD700', // Gold - highlights and accents
  background: '#F5F5F5', // Light gray background
  surface: '#FFFFFF', // White surface
  surfaceLight: '#FAFAFA', // Lighter surface
  surfaceElevated: '#E8E8E8', // Elevated elements
  text: '#1A1A1A', // Almost black text
  textSubtle: '#4A4A4A', // Gray text
  textMuted: '#8A8A8A', // Muted text
  border: '#E0E0E0', // Light borders
  success: '#00C853', // Green for success
  warning: '#FFA000', // Orange-yellow for warnings
  danger: '#FF5252', // Red for danger
  error: '#D32F2F', // Darker red for errors
  gpsActive: '#00D9FF', // Cyan for active GPS
  gpsInactive: '#A0A0A0', // Gray for inactive
};

// Iron Eagle Security Brand Colors - Dark Mode (Default for field officers)
export const darkColors = {
  primary: '#FF9500', // Orange - primary actions (high contrast)
  primaryDark: '#E67E00', // Darker orange for pressed states
  secondary: '#00D9FF', // Electric blue/cyan - secondary actions (neon effect)
  secondaryDark: '#00B8D4', // Darker cyan for pressed states
  accent: '#FFD700', // Gold - highlights and accents
  background: '#0A0A0A', // Pure black background
  surface: '#1A1A1A', // Dark gray surface
  surfaceLight: '#2A2A2A', // Lighter dark surface
  surfaceElevated: '#333333', // Elevated elements
  text: '#FFFFFF', // White text
  textSubtle: '#B0B0B0', // Light gray text
  textMuted: '#707070', // Muted gray text
  border: '#2A2A2A', // Dark borders
  success: '#00E676', // Bright green for success
  warning: '#FFB300', // Bright orange-yellow for warnings
  danger: '#FF5252', // Bright red for danger
  error: '#FF1744', // Brighter red for errors
  gpsActive: '#00E5FF', // Bright cyan for active GPS (neon effect)
  gpsInactive: '#606060', // Dark gray for inactive
};

// Create dynamic theme based on mode
class Theme {
  private _isDark: boolean = true; // Default to dark
  private listeners: Set<() => void> = new Set();

  get isDark() {
    return this._isDark;
  }

  set isDark(value: boolean) {
    if (this._isDark !== value) {
      this._isDark = value;
      this.notifyListeners();
    }
  }

  get colors() {
    return this._isDark ? darkColors : lightColors;
  }

  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners() {
    this.listeners.forEach(listener => listener());
  }

  spacing = {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
    xxl: 48,
  };

  fontSize = {
    xs: 12,
    sm: 14,
    md: 16,
    lg: 18,
    xl: 20,
    xxl: 24,
    title: 28,
  };

  borderRadius = {
    sm: 4,
    md: 8,
    lg: 12,
    xl: 16,
    full: 9999,
  };
}

export const theme = new Theme();

// Helper to get theme based on preference
export function getTheme(isDark: boolean) {
  theme.isDark = isDark;
  return theme;
}

// Helper to update global theme
export function setGlobalTheme(isDark: boolean) {
  theme.isDark = isDark;
}
