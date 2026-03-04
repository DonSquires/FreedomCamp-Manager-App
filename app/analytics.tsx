import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import {
  getStatsForDateRange,
  getTopZonesByActivity,
  getWeeklySummary,
} from '@/services/statsService';
import StatusHeader from '@/components/StatusHeader';

const { width } = Dimensions.get('window');

type TimeRange = '7d' | '30d' | '90d';

export default function AnalyticsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [selectedRange, setSelectedRange] = useState<TimeRange>('7d');
  const [rangeStats, setRangeStats] = useState<any>(null);
  const [topZones, setTopZones] = useState<any[]>([]);
  const [weeklySummary, setWeeklySummary] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAnalytics();
  }, [selectedRange]);

  const loadAnalytics = async () => {
    setLoading(true);
    try {
      const now = new Date();
      const startDate = new Date();

      if (selectedRange === '7d') {
        startDate.setDate(now.getDate() - 7);
      } else if (selectedRange === '30d') {
        startDate.setDate(now.getDate() - 30);
      } else if (selectedRange === '90d') {
        startDate.setDate(now.getDate() - 90);
      }

      const stats = await getStatsForDateRange(startDate, now);
      setRangeStats(stats);

      const zones = await getTopZonesByActivity(5);
      setTopZones(zones);

      const summary = await getWeeklySummary();
      setWeeklySummary(summary);
    } catch (error) {
      console.error('Error loading analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  const renderWeeklyChart = () => {
    if (weeklySummary.length === 0) return null;

    const maxScans = Math.max(...weeklySummary.map((d) => d.scans), 1);
    const chartHeight = 150;

    return (
      <View style={styles.chartContainer}>
        <Text style={styles.chartTitle}>Weekly Activity</Text>
        <View style={styles.chart}>
          {weeklySummary.map((day, index) => {
            const barHeight = (day.scans / maxScans) * chartHeight;
            const date = new Date(day.date);
            const dayLabel = date.toLocaleDateString('en-US', { weekday: 'short' });

            return (
              <View key={index} style={styles.chartColumn}>
                <View style={styles.barContainer}>
                  <View
                    style={[
                      styles.bar,
                      { height: Math.max(barHeight, 2) },
                      day.breaches > 0 && styles.barWithBreach,
                    ]}
                  />
                </View>
                <Text style={styles.chartLabel}>{dayLabel}</Text>
                <Text style={styles.chartValue}>{day.scans}</Text>
              </View>
            );
          })}
        </View>
      </View>
    );
  };

  const complianceRate =
    rangeStats?.totalScans > 0
      ? Math.round((rangeStats.compliantScans / rangeStats.totalScans) * 100)
      : 0;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Status Header */}
      <StatusHeader currentZone={null} />
      
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.push('/(tabs)')}>
          <MaterialIcons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Analytics</Text>
        <TouchableOpacity onPress={loadAnalytics}>
          <MaterialIcons name="refresh" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content}>
        {/* Time Range Selector */}
        <View style={styles.rangeSelector}>
          {(['7d', '30d', '90d'] as TimeRange[]).map((range) => (
            <TouchableOpacity
              key={range}
              style={[
                styles.rangeButton,
                selectedRange === range && styles.rangeButtonActive,
              ]}
              onPress={() => setSelectedRange(range)}
            >
              <Text
                style={[
                  styles.rangeButtonText,
                  selectedRange === range && styles.rangeButtonTextActive,
                ]}
              >
                {range === '7d' ? '7 Days' : range === '30d' ? '30 Days' : '90 Days'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Summary Stats */}
        {rangeStats && (
          <View style={styles.summaryCard}>
            <View style={styles.summaryRow}>
              <View style={styles.summaryItem}>
                <MaterialIcons name="camera-alt" size={32} color="#00b4d8" />
                <Text style={styles.summaryValue}>{rangeStats.totalScans}</Text>
                <Text style={styles.summaryLabel}>Total Scans</Text>
              </View>

              <View style={styles.summaryItem}>
                <MaterialIcons name="check-circle" size={32} color="#4caf50" />
                <Text style={styles.summaryValue}>{rangeStats.compliantScans}</Text>
                <Text style={styles.summaryLabel}>Compliant</Text>
              </View>

              <View style={styles.summaryItem}>
                <MaterialIcons name="warning" size={32} color="#f44336" />
                <Text style={styles.summaryValue}>{rangeStats.breachScans}</Text>
                <Text style={styles.summaryLabel}>Breaches</Text>
              </View>
            </View>

            <View style={styles.divider} />

            <View style={styles.summaryRow}>
              <View style={styles.summaryItem}>
                <MaterialIcons name="local-shipping" size={32} color="#9c27b0" />
                <Text style={styles.summaryValue}>{rangeStats.uniqueVehicles}</Text>
                <Text style={styles.summaryLabel}>Unique Vehicles</Text>
              </View>

              <View style={styles.summaryItem}>
                <MaterialIcons name="pie-chart" size={32} color="#00b4d8" />
                <Text style={styles.summaryValue}>{complianceRate}%</Text>
                <Text style={styles.summaryLabel}>Compliance Rate</Text>
              </View>
            </View>
          </View>
        )}

        {/* Weekly Chart */}
        {renderWeeklyChart()}

        {/* Top Zones */}
        <View style={styles.zonesCard}>
          <Text style={styles.zonesTitle}>Top Active Zones</Text>
          {topZones.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>No zone data yet</Text>
            </View>
          ) : (
            topZones.map((zone, index) => (
              <View key={index} style={styles.zoneItem}>
                <View style={styles.zoneRank}>
                  <Text style={styles.zoneRankText}>#{index + 1}</Text>
                </View>
                <View style={styles.zoneInfo}>
                  <Text style={styles.zoneName}>{zone.zoneName}</Text>
                  <Text style={styles.zoneStats}>
                    {zone.scanCount} scans · {zone.breachCount} breaches
                  </Text>
                </View>
                <View style={styles.zoneProgress}>
                  <View
                    style={[
                      styles.progressBar,
                      {
                        width: `${Math.min(
                          (zone.scanCount / (topZones[0]?.scanCount || 1)) * 100,
                          100
                        )}%`,
                      },
                    ]}
                  />
                </View>
              </View>
            ))
          )}
        </View>

        {/* Insights */}
        <View style={styles.insightsCard}>
          <Text style={styles.insightsTitle}>Quick Insights</Text>

          <View style={styles.insightItem}>
            <MaterialIcons name="info" size={20} color="#00b4d8" />
            <Text style={styles.insightText}>
              {rangeStats?.totalScans > 0
                ? `Average ${Math.round(
                    rangeStats.totalScans /
                      (selectedRange === '7d' ? 7 : selectedRange === '30d' ? 30 : 90)
                  )} scans per day`
                : 'No scans recorded yet'}
            </Text>
          </View>

          {rangeStats?.breachScans > 0 && (
            <View style={styles.insightItem}>
              <MaterialIcons name="trending-up" size={20} color="#f44336" />
              <Text style={styles.insightText}>
                {Math.round((rangeStats.breachScans / rangeStats.totalScans) * 100)}%
                of scans resulted in breaches
              </Text>
            </View>
          )}

          {topZones.length > 0 && (
            <View style={styles.insightItem}>
              <MaterialIcons name="location-on" size={20} color="#00b4d8" />
              <Text style={styles.insightText}>
                Most active zone: {topZones[0]?.zoneName}
              </Text>
            </View>
          )}
        </View>

        <View style={{ height: 32 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  rangeSelector: {
    flexDirection: 'row',
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 4,
    marginBottom: 16,
  },
  rangeButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
  },
  rangeButtonActive: {
    backgroundColor: '#00b4d8',
  },
  rangeButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#999',
  },
  rangeButtonTextActive: {
    color: '#fff',
  },
  summaryCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#333',
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  summaryItem: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  summaryValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#fff',
    marginTop: 8,
  },
  summaryLabel: {
    fontSize: 12,
    color: '#999',
    marginTop: 4,
  },
  divider: {
    height: 1,
    backgroundColor: '#333',
    marginVertical: 16,
  },
  chartContainer: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#333',
  },
  chartTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 16,
  },
  chart: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'flex-end',
    height: 200,
  },
  chartColumn: {
    flex: 1,
    alignItems: 'center',
  },
  barContainer: {
    flex: 1,
    width: '100%',
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginBottom: 8,
  },
  bar: {
    width: '60%',
    backgroundColor: '#00b4d8',
    borderRadius: 4,
  },
  barWithBreach: {
    backgroundColor: '#f44336',
  },
  chartLabel: {
    fontSize: 11,
    color: '#999',
    marginTop: 4,
  },
  chartValue: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
    marginTop: 2,
  },
  zonesCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#333',
  },
  zonesTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 16,
  },
  zoneItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 12,
  },
  zoneRank: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#00b4d8',
    justifyContent: 'center',
    alignItems: 'center',
  },
  zoneRankText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
  zoneInfo: {
    flex: 1,
  },
  zoneName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  zoneStats: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
  },
  zoneProgress: {
    width: 60,
    height: 6,
    backgroundColor: '#333',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#00b4d8',
  },
  insightsCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#333',
  },
  insightsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 12,
  },
  insightItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    gap: 12,
  },
  insightText: {
    fontSize: 14,
    color: '#999',
    flex: 1,
  },
  emptyState: {
    paddingVertical: 32,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: '#999',
  },
});
