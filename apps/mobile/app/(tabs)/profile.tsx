import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { isSupabaseConfigured, supabase } from '../../lib/supabase';

type Profile = { full_name: string; phone: string | null; preferred_language: string; role: string; account_status: string };
type Notification = { id: string; title: string; message: string; is_read: boolean; created_at: string };

export default function ProfileScreen() {
  const [profile,setProfile] = useState<Profile | null>(null);
  const [name,setName] = useState('');
  const [phone,setPhone] = useState('');
  const [language,setLanguage] = useState<'en'|'rw'>('en');
  const [notifications,setNotifications] = useState<Notification[]>([]);
  const [loading,setLoading] = useState(true);
  const [saving,setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!isSupabaseConfigured) { setLoading(false); return; }
    const {data:auth} = await supabase.auth.getUser();
    if (!auth.user) { router.replace('/'); return; }
    const [p,n] = await Promise.all([
      supabase.from('profiles').select('full_name,phone,preferred_language,role,account_status').eq('id',auth.user.id).maybeSingle(),
      supabase.from('notifications').select('id,title,message,is_read,created_at').order('created_at',{ascending:false}).limit(30),
    ]);
    if (p.error) Alert.alert('Could not load profile',p.error.message);
    if (n.error) Alert.alert('Could not load notifications',n.error.message);
    if (p.data) {
      const data = p.data as Profile;
      setProfile(data); setName(data.full_name || ''); setPhone(data.phone || '');
      setLanguage(data.preferred_language === 'rw' ? 'rw' : 'en');
    }
    setNotifications((n.data || []) as Notification[]);
    setLoading(false);
  },[]);
  useEffect(()=>{void load();},[load]);

  async function saveProfile() {
    if (name.trim().length < 2) { Alert.alert('Check your name','Enter at least two characters.'); return; }
    if (!isSupabaseConfigured) { Alert.alert('Connect Supabase','Configure the shared project before saving a profile.'); return; }
    setSaving(true);
    try {
      const {data:auth}=await supabase.auth.getUser();
      if(!auth.user) throw new Error('Please sign in again.');
      const {error}=await supabase.from('profiles').update({full_name:name.trim(),phone:phone.trim()||null,preferred_language:language}).eq('id',auth.user.id);
      if(error) throw error;
      await load();
      Alert.alert('Profile saved','Your profile preferences were updated.');
    } catch(error) {
      Alert.alert('Could not save profile',error instanceof Error?error.message:'Please try again.');
    } finally {setSaving(false);}
  }

  async function markRead(notification: Notification) {
    if(notification.is_read) return;
    const {error}=await supabase.from('notifications').update({is_read:true}).eq('id',notification.id);
    if(error) {Alert.alert('Could not update notification',error.message);return;}
    setNotifications(rows=>rows.map(row=>row.id===notification.id?{...row,is_read:true}:row));
  }

  async function signOut() {
    const {error}=await supabase.auth.signOut();
    if(error) {Alert.alert('Could not sign out',error.message);return;}
    router.replace('/');
  }

  if(loading) return <View style={styles.center}><ActivityIndicator color="#2869DF"/><Text style={styles.muted}>Loading your profile…</Text></View>;

  return <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
    <Text style={styles.kicker}>ACCOUNT & PREFERENCES</Text><Text style={styles.title}>Your profile</Text><Text style={styles.subtitle}>Update the contact details and language associated with your account.</Text>
    <View style={styles.card}><View style={styles.profileBadge}><Ionicons name="person-outline" size={26} color="#2869DF"/></View><Text style={styles.accountName}>{profile?.full_name || 'MotoSave rider'}</Text><Text style={styles.accountMeta}>{profile?.role?.replaceAll('_',' ') || 'rider'} · {profile?.account_status || 'active'}</Text>
      <Text style={styles.label}>Full name</Text><TextInput style={styles.input} value={name} onChangeText={setName} maxLength={160} placeholder="Your full name" placeholderTextColor="#94A1B5"/>
      <Text style={styles.label}>Phone (optional)</Text><TextInput style={styles.input} value={phone} onChangeText={setPhone} keyboardType="phone-pad" maxLength={32} placeholder="+250..." placeholderTextColor="#94A1B5"/>
      <Text style={styles.label}>Preferred language</Text><View style={styles.chips}><Pressable onPress={()=>setLanguage('en')} style={[styles.chip,language==='en'&&styles.chipActive]}><Text style={[styles.chipText,language==='en'&&styles.chipTextActive]}>English</Text></Pressable><Pressable onPress={()=>setLanguage('rw')} style={[styles.chip,language==='rw'&&styles.chipActive]}><Text style={[styles.chipText,language==='rw'&&styles.chipTextActive]}>Kinyarwanda</Text></Pressable></View>
      <Pressable style={[styles.button,saving&&{opacity:.6}]} disabled={saving} onPress={saveProfile}>{saving?<ActivityIndicator color="#fff"/>:<Text style={styles.buttonText}>Save profile  →</Text>}</Pressable>
    </View>
    <View style={styles.heading}><Text style={styles.sectionTitle}>Notifications</Text><Text style={styles.count}>{notifications.filter(n=>!n.is_read).length} unread</Text></View>
    {notifications.map(notification=><Pressable key={notification.id} onPress={()=>void markRead(notification)} style={[styles.notification,!notification.is_read&&styles.unread]}><View style={styles.notificationIcon}><Ionicons name={notification.is_read?'checkmark-done-outline':'notifications-outline'} size={19} color="#2869DF"/></View><View style={{flex:1}}><Text style={styles.notificationTitle}>{notification.title}</Text><Text style={styles.notificationMessage}>{notification.message}</Text><Text style={styles.notificationDate}>{new Date(notification.created_at).toLocaleDateString()}</Text></View></Pressable>)}
    {!notifications.length&&<Text style={styles.empty}>No notifications have been sent to this account yet.</Text>}
    <Pressable style={styles.supportButton} onPress={()=>router.push('/(tabs)/support')}><Ionicons name="help-buoy-outline" size={18} color="#2869DF"/><Text style={styles.supportText}>Open support center</Text><Ionicons name="chevron-forward" size={18} color="#8A97AC"/></Pressable>
    <Pressable style={styles.signOut} onPress={signOut}><Ionicons name="log-out-outline" size={18} color="#B54E60"/><Text style={styles.signOutText}>Sign out securely</Text></Pressable>
    <Text style={styles.footnote}>MotoSave staff roles cannot be changed from this screen. Account role and status are managed by trusted administrative processes.</Text>
  </ScrollView>;
}

const styles=StyleSheet.create({
 screen:{flex:1,backgroundColor:'#F6F8FC'},content:{padding:18,paddingBottom:38},
 center:{flex:1,alignItems:'center',justifyContent:'center',gap:12,backgroundColor:'#F6F8FC'},muted:{color:'#8492A8',fontSize:12},
 kicker:{marginTop:14,marginBottom:7,color:'#7486A3',fontSize:9,fontWeight:'800',letterSpacing:1.1},
 title:{color:'#1D304F',fontSize:28,fontWeight:'800',letterSpacing:-.7},subtitle:{color:'#8391A7',fontSize:11,lineHeight:17,marginTop:7,marginBottom:19},
 card:{padding:17,borderRadius:17,borderWidth:1,borderColor:'#E6ECF5',backgroundColor:'#fff',marginBottom:24},
 profileBadge:{width:51,height:51,borderRadius:16,backgroundColor:'#EAF1FF',alignItems:'center',justifyContent:'center',marginBottom:12},
 accountName:{color:'#263A58',fontSize:16,fontWeight:'800',marginBottom:4},accountMeta:{color:'#8996AB',fontSize:10,textTransform:'capitalize',marginBottom:18},
 label:{color:'#65758F',fontSize:10,fontWeight:'800',marginBottom:7},
 input:{height:45,borderWidth:1,borderColor:'#DFE7F2',borderRadius:10,paddingHorizontal:12,color:'#283A56',backgroundColor:'#FBFCFE',fontSize:11,marginBottom:13},
 chips:{flexDirection:'row',gap:8,marginBottom:14},chip:{paddingVertical:9,paddingHorizontal:12,borderRadius:9,borderWidth:1,borderColor:'#E0E8F4'},chipActive:{borderColor:'#A9C6F5',backgroundColor:'#EAF1FF'},chipText:{color:'#7A879B',fontSize:10,fontWeight:'700'},chipTextActive:{color:'#2869DF'},
 button:{height:46,alignItems:'center',justifyContent:'center',borderRadius:10,backgroundColor:'#2869DF'},buttonText:{color:'#fff',fontSize:11,fontWeight:'800'},
 heading:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginBottom:12},sectionTitle:{color:'#263954',fontSize:16,fontWeight:'800'},count:{color:'#2869DF',fontSize:9,fontWeight:'800'},
 notification:{flexDirection:'row',gap:10,padding:13,borderRadius:12,borderWidth:1,borderColor:'#E7EDF5',backgroundColor:'#fff',marginBottom:8},unread:{backgroundColor:'#F3F7FF',borderColor:'#CFDFFB'},
 notificationIcon:{width:36,height:36,borderRadius:10,backgroundColor:'#EAF1FF',alignItems:'center',justifyContent:'center'},notificationTitle:{color:'#344560',fontSize:11,fontWeight:'800',marginBottom:4},notificationMessage:{color:'#7D8BA1',fontSize:10,lineHeight:15},notificationDate:{color:'#A0ABBC',fontSize:8,marginTop:5},
 empty:{color:'#8996AB',fontSize:10,lineHeight:16,marginVertical:10},supportButton:{flexDirection:'row',alignItems:'center',gap:9,padding:14,borderRadius:12,borderWidth:1,borderColor:'#E3EAF5',backgroundColor:'#fff',marginTop:17},supportText:{flex:1,color:'#3E5E90',fontSize:11,fontWeight:'800'},
 signOut:{flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8,padding:13,marginTop:10},signOutText:{color:'#B54E60',fontSize:11,fontWeight:'800'},
 footnote:{color:'#9BA6B7',fontSize:9,lineHeight:15,marginTop:12}
});
