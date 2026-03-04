import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { getDatabase } from '@/services/database';
import StatusHeader from '@/components/StatusHeader';

type JobStatus = 'pending' | 'in-progress' | 'completed';

export default function JobsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [filter, setFilter] = useState<JobStatus | 'all'>('all');
  const [jobs, setJobs] = useState<any[]>([]);

  useEffect(() => {
    loadJobs();
  }, [filter]);

  const loadJobs = async () => {
    try {
      const db = getDatabase();
      
      let query = 'SELECT * FROM investigation_jobs';
      
      if (filter !== 'all') {
        query += ` WHERE status = '${filter}'`;
      }
      
      query += ' ORDER BY due_date ASC';
      
      const result = await db.getAllAsync<any>(query);
      setJobs(result || []);
    } catch (error) {
      console.error('Load jobs error:', error);
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return '#f44336';
      case 'medium': return '#ff9800';
      case 'low': return '#4caf50';
      default: return '#999';
    }
  };

  const getJobIcon = (jobType: string) => {
    switch (jobType) {
      case 'Homeless Occupation': return 'home';
      case 'Abandoned Vehicle': return 'directions-car';
      case 'Unauthorized Structure': return 'warning';
      default: return 'assignment';
    }
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffDays = Math.floor((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Tomorrow';
    if (diffDays < 0) return `${Math.abs(diffDays)}d overdue`;
    return `${diffDays}d`;
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Status Header */}
      <StatusHeader currentZone={null} />
      
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <MaterialIcons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Investigation Jobs</Text>
        <TouchableOpacity onPress={loadJobs}>
          <MaterialIcons name="refresh" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Filter Tabs */}
      <View style={styles.filterRow}>
        {(['all', 'pending', 'in-progress', 'completed'] as const).map((status) => (
          <TouchableOpacity
            key={status}
            style={[
              styles.filterTab,
              filter === status && styles.filterTabActive,
            ]}
            onPress={() => setFilter(status)}
          >
            <Text
              style={[
                styles.filterTabText,
                filter === status && styles.filterTabTextActive,
              ]}
            >
              {status === 'all' ? 'All' : status.replace('-', ' ')}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Jobs List */}
      <ScrollView style={styles.jobsList}>
        {jobs.length === 0 ? (
          <View style={styles.emptyState}>
            <MaterialIcons name="check-circle" size={64} color="#4caf50" />
            <Text style={styles.emptyText}>No jobs found</Text>
            <Text style={styles.emptySubtext}>
              {filter === 'all' ? 'No jobs assigned' : `No ${filter} jobs`}
            </Text>
          </View>
        ) : (
          jobs.map((job) => (
            <TouchableOpacity
              key={job.id}
              style={styles.jobCard}
              onPress={() => router.push({ pathname: '/jobs/[id]', params: { id: job.id } })}
            >
              <View style={styles.jobHeader}>
                <MaterialIcons
                  name={getJobIcon(job.job_type) as any}
                  size={32}
                  color="#00b4d8"
                />
                <View style={styles.jobHeaderInfo}>
                  <Text style={styles.jobType}>{job.job_type}</Text>
                  <Text style={styles.jobReference}>#{job.reference_number}</Text>
                </View>
                <View
                  style={[
                    styles.priorityBadge,
                    { backgroundColor: getPriorityColor(job.priority) },
                  ]}
                >
                  <Text style={styles.priorityText}>{job.priority}</Text>
                </View>
              </View>

              <View style={styles.jobDetails}>
                <View style={styles.jobDetailRow}>
                  <MaterialIcons name="location-on" size={16} color="#999" />
                  <Text style={styles.jobDetailText} numberOfLines={1}>
                    {job.location_address}
                  </Text>
                </View>

                {job.due_date && (
                  <View style={styles.jobDetailRow}>
                    <MaterialIcons name="schedule" size={16} color="#999" />
                    <Text style={styles.jobDetailText}>
                      Due: {formatDate(job.due_date)}
                    </Text>
                  </View>
                )}

                {job.client_name && (
                  <View style={styles.jobDetailRow}>
                    <MaterialIcons name="business" size={16} color="#999" />
                    <Text style={styles.jobDetailText}>{job.client_name}</Text>
                  </View>
                )}
              </View>

              <View style={styles.jobFooter}>
                <View
                  style={[
                    styles.statusBadge,
                    job.status === 'pending' && styles.statusPending,
                    job.status === 'in-progress' && styles.statusInProgress,
                    job.status === 'completed' && styles.statusCompleted,
                  ]}
                >
                  <Text style={styles.statusText}>
                    {job.status.replace('-', ' ')}
                  </Text>
                </View>
                <MaterialIcons name="chevron-right" size={24} color="#666" />
              </View>
            </TouchableOpacity>
          ))
        )}
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
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  filterTab: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#1a1a1a',
    alignItems: 'center',
  },
  filterTabActive: {
    backgroundColor: '#00b4d8',
  },
  filterTabText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#999',
    textTransform: 'capitalize',
  },
  filterTabTextActive: {
    color: '#fff',
  },
  jobsList: {
    flex: 1,
    padding: 16,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 64,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
    marginTop: 8,
  },
  jobCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#333',
  },
  jobHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 12,
  },
  jobHeaderInfo: {
    flex: 1,
  },
  jobType: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  jobReference: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
  },
  priorityBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  priorityText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
    textTransform: 'capitalize',
  },
  jobDetails: {
    gap: 8,
    marginBottom: 12,
  },
  jobDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  jobDetailText: {
    fontSize: 14,
    color: '#999',
    flex: 1,
  },
  jobFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#333',
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusPending: {
    backgroundColor: '#ff9800',
  },
  statusInProgress: {
    backgroundColor: '#00b4d8',
  },
  statusCompleted: {
    backgroundColor: '#4caf50',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
    textTransform: 'capitalize',
  },
});
