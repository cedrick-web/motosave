import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { isSupabaseConfigured, supabase } from '../../lib/supabase';

type Ticket = { id: string; subject: string; category: string; description: string; status: string; created_at: string };
type SupportMessage = { id: string; ticket_id: string; author_id: string; body: string; created_at: string };

const formatDate = (value: string) => new Intl.DateTimeFormat('en-RW', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value));

export default function SupportScreen() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [selectedTicketId, setSelectedTicketId] = useState('');
  const [ticketMessages, setTicketMessages] = useState<SupportMessage[]>([]);
  const [replyText, setReplyText] = useState('');
  const [currentUserId, setCurrentUserId] = useState('');
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sendingReply, setSendingReply] = useState(false);
  const [category, setCategory] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    if (!isSupabaseConfigured) { setLoading(false); return; }
    const { data: auth } = await supabase.auth.getUser();
    setCurrentUserId(auth.user?.id || '');
    const { data, error } = await supabase.from('support_tickets')
      .select('id,subject,category,description,status,created_at')
      .order('created_at', { ascending: false }).limit(50);
    if (error) Alert.alert('Could not load support requests', error.message);
    const nextTickets = (data || []) as Ticket[];
    setTickets(nextTickets);
    setSelectedTicketId((current) => nextTickets.some((ticket) => ticket.id === current) ? current : (nextTickets[0]?.id || ''));
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const loadMessages = useCallback(async (ticketId: string) => {
    if (!ticketId || !isSupabaseConfigured) { setTicketMessages([]); return; }
    setLoadingMessages(true);
    try {
      const { data, error } = await supabase.from('support_messages')
        .select('id,ticket_id,author_id,body,created_at')
        .eq('ticket_id', ticketId).order('created_at', { ascending: true }).limit(500);
      if (error) throw error;
      setTicketMessages((data || []) as SupportMessage[]);
    } catch (error) {
      Alert.alert('Could not load conversation', error instanceof Error ? error.message : 'Please try again.');
    } finally { setLoadingMessages(false); }
  }, []);

  useEffect(() => { void loadMessages(selectedTicketId); }, [loadMessages, selectedTicketId]);

  async function sendReply() {
    const body = replyText.trim();
    const selected = tickets.find((ticket) => ticket.id === selectedTicketId);
    if (!selected) { Alert.alert('Choose a request', 'Select a support request to reply to.'); return; }
    if (!body) { Alert.alert('Write a reply', 'Enter a message before sending.'); return; }
    if (['resolved','closed'].includes(selected.status)) {
      Alert.alert('Request closed', 'Create a new ticket if you still need help.');
      return;
    }
    setSendingReply(true);
    try {
      const { data, error } = await supabase.functions.invoke('partner-operations', {
        body: { action: 'reply_to_support_ticket', ticket_id: selected.id, message: body },
      });
      if (error) throw error;
      if (data?.error) throw new Error(String(data.error));
      setReplyText('');
      await Promise.all([load(), loadMessages(selected.id)]);
      Alert.alert('Reply sent', 'Your message has been added to the support conversation.');
    } catch (error) {
      Alert.alert('Could not send reply', error instanceof Error ? error.message : 'Please try again.');
    } finally { setSendingReply(false); }
  }



  async function submit() {
    if (!category) { Alert.alert('Choose a topic', 'Select the category that best matches your issue.'); return; }
    if (message.trim().length < 10) { Alert.alert('Add more detail', 'Describe the issue in at least 10 characters.'); return; }
    if (!isSupabaseConfigured) { Alert.alert('Connect Supabase', 'Support tickets need the configured shared Supabase backend.'); return; }
    setSending(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error('Please sign in again.');
      const { error } = await supabase.from('support_tickets').insert({
        user_id: auth.user.id, subject: 'MotoSave support: ' + category, category, description: message.trim(),
      });
      if (error) throw error;
      setCategory(''); setMessage('');
      await load();
      Alert.alert('Request submitted', 'Your support request was saved. The support team may need to assign it before responding.');
    } catch (error) {
      Alert.alert('Could not submit support request', error instanceof Error ? error.message : 'Please try again.');
    } finally { setSending(false); }
  }

  return <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
    <View style={styles.hero}><View style={styles.heroIcon}><Ionicons name="help-buoy-outline" size={25} color="#fff" /></View><Text style={styles.kicker}>MOTOSAVE SUPPORT</Text><Text style={styles.title}>Help that keeps your next step clear.</Text><Text style={styles.subtitle}>Send a private request connected to your account. Do not include passwords, payment PINs, or verification codes.</Text></View>
    <View style={styles.formCard}><Text style={styles.formTitle}>New support request</Text><Text style={styles.label}>Topic</Text><View style={styles.chips}>
      {['Account access','Savings record','Loan application','Insurance policy','Payment question','Other'].map((value) => <Pressable key={value} onPress={() => setCategory(value)} style={[styles.chip, category === value && styles.chipActive]}><Text style={[styles.chipText, category === value && styles.chipTextActive]}>{value}</Text></Pressable>)}
    </View><TextInput style={[styles.input,styles.message]} value={message} onChangeText={setMessage} multiline maxLength={5000} placeholder="Describe what happened and what you expected." placeholderTextColor="#94A1B5" />
      <Pressable style={[styles.button,sending && {opacity:.6}]} disabled={sending} onPress={submit}>{sending ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Submit support request  →</Text>}</Pressable>
    </View>
    <View style={styles.sectionHeading}><Text style={styles.sectionTitle}>Your requests</Text><Text style={styles.count}>{tickets.length}</Text></View>
    {loading ? <ActivityIndicator color="#2869DF" style={{ marginTop: 20 }} /> : tickets.map((ticket) => <Pressable key={ticket.id} onPress={() => setSelectedTicketId(ticket.id)} style={[styles.ticketCard,selectedTicketId===ticket.id&&styles.ticketSelected]}><View style={styles.ticketIcon}><Ionicons name="chatbubble-ellipses-outline" size={20} color="#2869DF" /></View><View style={{flex:1}}><Text style={styles.ticketTitle}>{ticket.subject}</Text><Text style={styles.ticketMeta}>{formatDate(ticket.created_at)} · {ticket.category}</Text><Text style={styles.ticketDescription}>{ticket.description}</Text></View><View style={styles.status}><Text style={styles.statusText}>{ticket.status.replaceAll('_',' ')}</Text></View></Pressable>)}
    {!loading && tickets.length === 0 && <View style={styles.empty}><Ionicons name="chatbubbles-outline" size={26} color="#7698D3" /><Text style={styles.emptyTitle}>No support requests yet</Text><Text style={styles.emptyText}>Requests you submit will appear here.</Text></View>}
    {selectedTicketId && <View style={styles.formCard}><Text style={styles.formTitle}>Conversation</Text><Text style={styles.formHint}>Messages are private to this support request. Never send passwords, PINs, or verification codes.</Text>
      {loadingMessages ? <ActivityIndicator color="#2869DF" style={{marginVertical:14}}/> : ticketMessages.map(item=><View key={item.id} style={[styles.messageBubble,item.author_id===currentUserId ? styles.messageOwn : styles.messageStaff]}><Text style={styles.messageAuthor}>{item.author_id===currentUserId?'You':'MotoSave support'}</Text><Text style={styles.messageText}>{item.body}</Text><Text style={styles.messageDate}>{formatDate(item.created_at)}</Text></View>)}
      {!loadingMessages&&!ticketMessages.length&&<Text style={styles.emptyText}>No replies yet. New responses will appear here.</Text>}
      {tickets.find(ticket=>ticket.id===selectedTicketId)&&!['resolved','closed'].includes(tickets.find(ticket=>ticket.id===selectedTicketId)!.status)
        ? <><TextInput style={[styles.input,styles.message]} value={replyText} onChangeText={setReplyText} multiline maxLength={5000} placeholder="Reply to your support request..." placeholderTextColor="#94A1B5"/><Pressable style={[styles.button,sendingReply&&{opacity:.6}]} disabled={sendingReply||!replyText.trim()} onPress={sendReply}>{sendingReply?<ActivityIndicator color="#fff"/>:<Text style={styles.buttonText}>Send reply  →</Text>}</Pressable></>
        : <Text style={styles.footerNote}>This request is closed. Create a new request if you still need support.</Text>}
    </View>}
  </ScrollView>;
}

const styles = StyleSheet.create({
  screen:{flex:1,backgroundColor:'#F6F8FC'},content:{padding:18,paddingBottom:35},
  hero:{padding:20,borderRadius:18,backgroundColor:'#1B437D',marginTop:14,marginBottom:16},
  heroIcon:{width:43,height:43,borderRadius:13,backgroundColor:'#FFFFFF18',alignItems:'center',justifyContent:'center',marginBottom:15},
  kicker:{color:'#C6D9FA',fontSize:9,fontWeight:'800',letterSpacing:1.1,marginBottom:9},
  title:{color:'#fff',fontSize:25,fontWeight:'800',letterSpacing:-.6,lineHeight:30,marginBottom:10},
  subtitle:{color:'#D4E2F8',fontSize:11,lineHeight:17},
  formCard:{padding:15,borderRadius:16,backgroundColor:'#fff',borderWidth:1,borderColor:'#E6ECF5',marginBottom:24},
  formTitle:{color:'#273A57',fontSize:14,fontWeight:'800',marginBottom:14},
  formHint:{color:'#8996AB',fontSize:10,lineHeight:15,marginBottom:12},
  footerNote:{color:'#9AA5B6',fontSize:9,lineHeight:15,marginTop:14},
  label:{color:'#65758F',fontSize:10,fontWeight:'800',marginBottom:8},
  chips:{flexDirection:'row',flexWrap:'wrap',gap:7,marginBottom:13},
  chip:{borderWidth:1,borderColor:'#E0E8F4',borderRadius:8,paddingHorizontal:10,paddingVertical:8,backgroundColor:'#fff'},
  chipActive:{borderColor:'#A9C6F5',backgroundColor:'#EAF1FF'},
  chipText:{color:'#7A879B',fontSize:9,fontWeight:'700'},chipTextActive:{color:'#2869DF'},
  input:{minHeight:44,borderWidth:1,borderColor:'#DFE7F2',borderRadius:10,paddingHorizontal:12,color:'#283A56',backgroundColor:'#FBFCFE',fontSize:11,marginBottom:11},
  message:{minHeight:100,paddingTop:11,textAlignVertical:'top'},
  button:{minHeight:45,alignItems:'center',justifyContent:'center',borderRadius:10,backgroundColor:'#2869DF'},
  buttonText:{color:'#fff',fontSize:11,fontWeight:'800'},
  sectionHeading:{flexDirection:'row',alignItems:'center',gap:8,marginBottom:12},
  sectionTitle:{color:'#263954',fontSize:16,fontWeight:'800'},
  count:{color:'#2869DF',backgroundColor:'#E6EEFF',borderRadius:7,overflow:'hidden',paddingHorizontal:8,paddingVertical:4,fontSize:9,fontWeight:'800'},
  ticketCard:{flexDirection:'row',alignItems:'flex-start',gap:10,padding:13,borderRadius:13,backgroundColor:'#fff',borderWidth:1,borderColor:'#E7EDF5',marginBottom:9},
  ticketSelected:{borderColor:'#A9C6F5',backgroundColor:'#F3F7FF'},
  messageBubble:{padding:11,borderRadius:11,borderWidth:1,marginBottom:8},
  messageOwn:{borderColor:'#CFE0FA',backgroundColor:'#F2F7FF'},
  messageStaff:{borderColor:'#E7EDF5',backgroundColor:'#FBFCFE'},
  messageAuthor:{color:'#516989',fontSize:9,fontWeight:'800',marginBottom:5},
  messageText:{color:'#3A4C68',fontSize:10,lineHeight:16},
  messageDate:{color:'#91A0B4',fontSize:8,marginTop:6},
  ticketIcon:{width:40,height:40,borderRadius:12,backgroundColor:'#EAF1FF',alignItems:'center',justifyContent:'center'},
  ticketTitle:{color:'#344560',fontSize:11,fontWeight:'800',marginBottom:4},
  ticketMeta:{color:'#8A97AC',fontSize:9,marginBottom:6},
  ticketDescription:{color:'#75839A',fontSize:10,lineHeight:15},
  status:{paddingHorizontal:7,paddingVertical:6,borderRadius:7,backgroundColor:'#FFF4DF',maxWidth:90},
  statusText:{color:'#A27322',fontSize:8,fontWeight:'800',textTransform:'capitalize'},
  empty:{alignItems:'center',padding:25,borderRadius:14,borderStyle:'dashed',borderWidth:1,borderColor:'#DCE5F4',backgroundColor:'#FCFDFF'},
  emptyTitle:{color:'#354861',fontWeight:'800',fontSize:13,marginTop:9},emptyText:{color:'#8996AB',fontSize:10,textAlign:'center',marginTop:5}
});
