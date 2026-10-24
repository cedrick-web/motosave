import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { Linking } from 'react-native';
import { decode } from 'base64-arraybuffer';
import { isSupabaseConfigured, supabase } from '../../lib/supabase';

type MaintenanceRecord = { id: string; motorcycle_id: string; service_date: string; description: string; amount: number; odometer_km: number | null; next_service_date: string | null };
type MotorcycleDocument = { id: string; motorcycle_id: string; document_type: string; storage_path: string; expires_on: string | null; verification_status: string; created_at: string };
type Motorcycle = {
  id: string; registration_number: string; make: string; model: string;
  model_year: number | null; vehicle_type: string; is_electric: boolean; status: string; created_at: string;
};

export default function MotorcyclesScreen() {
  const [motorcycles, setMotorcycles] = useState<Motorcycle[]>([]);
  const [maintenanceRecords, setMaintenanceRecords] = useState<MaintenanceRecord[]>([]);
  const [documents, setDocuments] = useState<MotorcycleDocument[]>([]);
  const [documentBikeId, setDocumentBikeId] = useState('');
  const [documentType, setDocumentType] = useState('registration');
  const [documentExpiry, setDocumentExpiry] = useState('');
  const [pickedDocument, setPickedDocument] = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [uploadingDocument, setUploadingDocument] = useState(false);
  const [maintenanceBikeId, setMaintenanceBikeId] = useState('');
  const [serviceDate, setServiceDate] = useState(new Date().toISOString().slice(0,10));
  const [serviceDescription, setServiceDescription] = useState('');
  const [serviceAmount, setServiceAmount] = useState('');
  const [odometerKm, setOdometerKm] = useState('');
  const [nextServiceDate, setNextServiceDate] = useState('');
  const [savingService, setSavingService] = useState(false);
  const [registration, setRegistration] = useState('');
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [year, setYear] = useState('');
  const [vehicleType, setVehicleType] = useState<'petrol' | 'electric' | 'hybrid' | 'other'>('petrol');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!isSupabaseConfigured) { setLoading(false); return; }
    const [bikeResult, serviceResult, documentResult] = await Promise.all([
      supabase.from('motorcycles').select('id,registration_number,make,model,model_year,vehicle_type,is_electric,status,created_at').order('created_at', { ascending: false }),
      supabase.from('maintenance_records').select('id,motorcycle_id,service_date,description,amount,odometer_km,next_service_date').order('service_date', { ascending: false }).limit(100),
      supabase.from('motorcycle_documents').select('id,motorcycle_id,document_type,storage_path,expires_on,verification_status,created_at').order('created_at', { ascending: false }).limit(100),
    ]);
    if (bikeResult.error) Alert.alert('Could not load motorcycles', bikeResult.error.message);
    if (serviceResult.error) Alert.alert('Could not load service history', serviceResult.error.message);
    if (documentResult.error) Alert.alert('Could not load documents', documentResult.error.message);
    const nextBikes = (bikeResult.data || []) as Motorcycle[];
    setMotorcycles(nextBikes);
    setMaintenanceRecords((serviceResult.data || []) as MaintenanceRecord[]);
    setDocuments((documentResult.data || []) as MotorcycleDocument[]);
    if (!maintenanceBikeId && nextBikes.length) setMaintenanceBikeId(nextBikes[0].id);
    if (!documentBikeId && nextBikes.length) setDocumentBikeId(nextBikes[0].id);
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function addMotorcycle() {
    const registration_number = registration.trim().toUpperCase();
    const model_year = year.trim() ? Number(year) : null;
    if (!registration_number || make.trim().length < 2 || model.trim().length < 1) {
      Alert.alert('Complete motorcycle details', 'Registration number, make, and model are required.');
      return;
    }
    if (model_year !== null && (!Number.isInteger(model_year) || model_year < 1980 || model_year > new Date().getFullYear() + 1)) {
      Alert.alert('Check the model year', 'Enter a valid model year or leave it blank.');
      return;
    }
    if (!isSupabaseConfigured) {
      Alert.alert('Connect Supabase', 'Configure the shared Supabase project before saving motorcycle records.');
      return;
    }
    setSaving(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error('Please sign in again.');
      const { error } = await supabase.from('motorcycles').insert({
        owner_id: auth.user.id,
        registration_number,
        make: make.trim(),
        model: model.trim(),
        model_year,
        vehicle_type: vehicleType,
        is_electric: vehicleType === 'electric',
      });
      if (error) throw error;
      setRegistration(''); setMake(''); setModel(''); setYear(''); setVehicleType('petrol');
      await load();
      Alert.alert('Motorcycle added', 'The motorcycle is now linked to your account. Document verification is a separate step.');
    } catch (error) {
      Alert.alert('Could not save motorcycle', error instanceof Error ? error.message : 'Please try again.');
    } finally { setSaving(false); }
  }

  async function pickDocument() {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      const accepted = ['application/pdf','image/jpeg','image/png','image/webp'];
      if (!asset || !asset.mimeType || !accepted.includes(asset.mimeType)) {
        Alert.alert('Unsupported file', 'Choose a PDF, JPEG, PNG, or WebP document.');
        return;
      }
      if (asset.size !== undefined && (asset.size <= 0 || asset.size > 10 * 1024 * 1024)) {
        Alert.alert('File too large', 'Choose a file smaller than 10 MB.');
        return;
      }
      setPickedDocument(asset);
    } catch (error) {
      Alert.alert('Could not open documents', error instanceof Error ? error.message : 'Please try again.');
    }
  }

  async function uploadDocument() {
    if (!documentBikeId) { Alert.alert('Choose a motorcycle', 'Add or select one of your motorcycles first.'); return; }
    if (!pickedDocument) { Alert.alert('Choose a document', 'Select a document before uploading.'); return; }
    if (!isSupabaseConfigured) { Alert.alert('Connect Supabase', 'Private document uploads require the configured shared Supabase backend.'); return; }
    setUploadingDocument(true);
    let uploadedPath: string | null = null;
    try {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error('Please sign in again.');
      const base64 = await FileSystem.readAsStringAsync(pickedDocument.uri, { encoding: FileSystem.EncodingType.Base64 });
      const bytes = decode(base64);
      const safeName = pickedDocument.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-120);
      uploadedPath = auth.user.id + '/' + documentBikeId + '/' + Date.now() + '-' + safeName;
      const { error: uploadError } = await supabase.storage.from('rider-documents').upload(uploadedPath, bytes, {
        contentType: pickedDocument.mimeType || 'application/octet-stream',
        upsert: false,
      });
      if (uploadError) throw uploadError;
      const { error: rowError } = await supabase.from('motorcycle_documents').insert({
        owner_id: auth.user.id,
        motorcycle_id: documentBikeId,
        document_type: documentType,
        storage_path: uploadedPath,
        expires_on: documentExpiry || null,
      });
      if (rowError) {
        await supabase.storage.from('rider-documents').remove([uploadedPath]);
        uploadedPath = null;
        throw rowError;
      }
      setPickedDocument(null); setDocumentExpiry('');
      await load();
      Alert.alert('Document uploaded', 'Your file is stored in a private bucket. Its verification state remains unverified until an authorized review.');
    } catch (error) {
      if (uploadedPath) await supabase.storage.from('rider-documents').remove([uploadedPath]);
      Alert.alert('Upload failed', error instanceof Error ? error.message : 'Please check the file and connection.');
    } finally { setUploadingDocument(false); }
  }

  async function openDocument(document: MotorcycleDocument) {
    if (document.storage_path.startsWith('DEMO-ONLY/')) {
      Alert.alert('Demo record only', 'This record has no uploaded file.');
      return;
    }
    try {
      const { data, error } = await supabase.storage.from('rider-documents').createSignedUrl(document.storage_path, 60);
      if (error || !data?.signedUrl) throw error || new Error('Could not create a private link.');
      await Linking.openURL(data.signedUrl);
    } catch (error) {
      Alert.alert('Could not open document', error instanceof Error ? error.message : 'Please try again.');
    }
  }

  async function addMaintenanceRecord() {
    const numericAmount = Number(serviceAmount || '0');
    const numericOdometer = odometerKm.trim() ? Number(odometerKm) : null;
    if (!maintenanceBikeId) { Alert.alert('Choose a motorcycle', 'Add a motorcycle before tracking maintenance.'); return; }
    if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(serviceDate) || Number.isNaN(Date.parse(serviceDate))) { Alert.alert('Check the service date', 'Use YYYY-MM-DD format.'); return; }
    if (serviceDescription.trim().length < 3) { Alert.alert('Describe the service', 'Enter at least three characters for the work performed.'); return; }
    if (!Number.isFinite(numericAmount) || numericAmount < 0) { Alert.alert('Check the cost', 'Enter a non-negative amount.'); return; }
    if (numericOdometer !== null && (!Number.isInteger(numericOdometer) || numericOdometer < 0)) { Alert.alert('Check the odometer', 'Enter a non-negative whole number.'); return; }
    if (nextServiceDate && (!/^\\d{4}-\\d{2}-\\d{2}$/.test(nextServiceDate) || Number.isNaN(Date.parse(nextServiceDate)))) { Alert.alert('Check the next service date', 'Use YYYY-MM-DD format.'); return; }
    if (!isSupabaseConfigured) { Alert.alert('Connect Supabase', 'Maintenance records need the shared Supabase backend.'); return; }
    setSavingService(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error('Please sign in again.');
      const { error } = await supabase.from('maintenance_records').insert({
        owner_id: auth.user.id,
        motorcycle_id: maintenanceBikeId,
        service_date: serviceDate,
        description: serviceDescription.trim(),
        amount: numericAmount,
        odometer_km: numericOdometer,
        next_service_date: nextServiceDate || null,
      });
      if (error) throw error;
      setServiceDescription(''); setServiceAmount(''); setOdometerKm(''); setNextServiceDate('');
      await load();
      Alert.alert('Service record saved', 'Your maintenance entry has been saved to your account.');
    } catch(error) {
      Alert.alert('Could not save service record', error instanceof Error ? error.message : 'Please try again.');
    } finally { setSavingService(false); }
  }

  async function setInactive(bike: Motorcycle) {
    Alert.alert('Mark motorcycle inactive?', 'This hides it from your active motorcycle list. It does not change ownership records.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Mark inactive', style: 'destructive', onPress: async () => {
        try {
          const { error } = await supabase.from('motorcycles').update({ status: 'inactive' }).eq('id', bike.id);
          if (error) throw error;
          await load();
        } catch (error) { Alert.alert('Could not update motorcycle', error instanceof Error ? error.message : 'Please try again.'); }
      }},
    ]);
  }

  return <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
    <Text style={styles.kicker}>YOUR WORK ASSET</Text><Text style={styles.title}>My motorcycles</Text>
    <Text style={styles.subtitle}>Keep core details organized. Document verification and insurer-issued coverage require separate confirmation.</Text>
    <View style={styles.formCard}><Text style={styles.formTitle}>Add a motorcycle</Text>
      <TextInput style={styles.input} value={registration} onChangeText={setRegistration} autoCapitalize="characters" placeholder="Registration number (e.g. RAA 123 A)" placeholderTextColor="#94A1B5" maxLength={24} />
      <View style={styles.row}><TextInput style={[styles.input, styles.flexInput]} value={make} onChangeText={setMake} placeholder="Make (TVS)" placeholderTextColor="#94A1B5" maxLength={80} /><TextInput style={[styles.input, styles.flexInput]} value={model} onChangeText={setModel} placeholder="Model" placeholderTextColor="#94A1B5" maxLength={80} /></View>
      <TextInput style={styles.input} value={year} onChangeText={setYear} keyboardType="number-pad" placeholder="Model year (optional)" placeholderTextColor="#94A1B5" maxLength={4} />
      <Text style={styles.label}>Motorcycle type</Text><View style={styles.chips}>
        {([{ key: 'petrol', label: 'Petrol' }, { key: 'electric', label: 'Electric' }, { key: 'hybrid', label: 'Hybrid' }, { key: 'other', label: 'Other' }] as const).map((option) => <Pressable key={option.key} onPress={() => setVehicleType(option.key)} style={[styles.chip, vehicleType === option.key && styles.chipActive]}><Text style={[styles.chipText, vehicleType === option.key && styles.chipTextActive]}>{option.label}</Text></Pressable>)}
      </View>
      <Pressable style={[styles.button, saving && { opacity: .6 }]} onPress={addMotorcycle} disabled={saving}>{saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Save motorcycle  →</Text>}</Pressable>
    </View>
    <View style={styles.sectionHeading}><Text style={styles.sectionTitle}>Your records</Text><Text style={styles.count}>{motorcycles.length}</Text></View>
    {loading ? <ActivityIndicator color="#2869DF" style={{ marginTop: 20 }} /> : motorcycles.map((bike) => <View key={bike.id} style={styles.bikeCard}><View style={styles.bikeIcon}><Ionicons name="bicycle-outline" size={22} color="#2869DF" /></View><View style={styles.bikeDetail}><Text style={styles.bikeTitle}>{bike.make} {bike.model}</Text><Text style={styles.bikeMeta}>{bike.registration_number}{bike.model_year ? ' · ' + bike.model_year : ''}</Text><Text style={styles.bikeMeta}>{bike.vehicle_type.replaceAll('_', ' ')} · {bike.status}</Text></View>{bike.status === 'active' && <Pressable style={styles.moreButton} onPress={() => setInactive(bike)} accessibilityLabel="Mark motorcycle inactive"><Ionicons name="ellipsis-vertical" size={18} color="#8292AA" /></Pressable>}</View>)}
    {!loading && motorcycles.length === 0 && <View style={styles.empty}><Ionicons name="bicycle-outline" size={26} color="#7798D3" /><Text style={styles.emptyTitle}>No motorcycles linked yet</Text><Text style={styles.emptyText}>Add a motorcycle above to connect financial planning and policy records to your work asset.</Text></View>}
    <View style={styles.sectionHeading}><Text style={styles.sectionTitle}>Private documents</Text><Text style={styles.count}>{documents.length}</Text></View>
    <View style={styles.formCard}>
      <Text style={styles.formTitle}>Upload a motorcycle document</Text>
      <Text style={styles.formHint}>PDF, JPEG, PNG, or WebP up to 10 MB. Files are private to your account. Avoid unrelated personal information.</Text>
      <View style={styles.chips}>
        {motorcycles.filter(bike=>bike.status==='active').map(bike=><Pressable key={bike.id} onPress={()=>setDocumentBikeId(bike.id)} style={[styles.chip,documentBikeId===bike.id&&styles.chipActive]}><Text style={[styles.chipText,documentBikeId===bike.id&&styles.chipTextActive]}>{bike.registration_number}</Text></Pressable>)}
      </View>
      <Text style={styles.label}>Document type</Text>
      <View style={styles.chips}>{([{key:'registration',label:'Registration'},{key:'insurance',label:'Insurance'},{key:'inspection',label:'Inspection'},{key:'ownership',label:'Ownership'},{key:'other',label:'Other'}] as const).map(option=><Pressable key={option.key} onPress={()=>setDocumentType(option.key)} style={[styles.chip,documentType===option.key&&styles.chipActive]}><Text style={[styles.chipText,documentType===option.key&&styles.chipTextActive]}>{option.label}</Text></Pressable>)}</View>
      <TextInput style={styles.input} value={documentExpiry} onChangeText={setDocumentExpiry} placeholder="Expiry date (optional, YYYY-MM-DD)" placeholderTextColor="#94A1B5" maxLength={10}/>
      <Pressable style={styles.secondaryButton} onPress={pickDocument}><Ionicons name="document-attach-outline" size={17} color="#2869DF"/><Text style={styles.secondaryButtonText}>{pickedDocument ? pickedDocument.name : 'Choose a file'}</Text></Pressable>
      <Pressable style={[styles.button,uploadingDocument&&{opacity:.6}]} onPress={uploadDocument} disabled={uploadingDocument||!motorcycles.length}>{uploadingDocument?<ActivityIndicator color="#fff"/>:<Text style={styles.buttonText}>Upload private document  →</Text>}</Pressable>
    </View>
    {documents.map(document=><Pressable key={document.id} style={styles.documentCard} onPress={()=>void openDocument(document)}><View style={styles.bikeIcon}><Ionicons name="document-text-outline" size={20} color="#2869DF"/></View><View style={styles.bikeDetail}><Text style={styles.bikeTitle}>{document.document_type.replaceAll('_',' ')}</Text><Text style={styles.bikeMeta}>{motorcycles.find(bike=>bike.id===document.motorcycle_id)?.registration_number || 'Motorcycle'} · {document.expires_on || 'No expiry date'}</Text><Text style={styles.bikeMeta}>{document.verification_status.replaceAll('_',' ')}</Text></View><Ionicons name="open-outline" size={17} color="#7C8BA1"/></Pressable>)}
    {!loading&&!documents.length&&<Text style={styles.footnote}>No documents uploaded yet.</Text>}
    <View style={styles.sectionHeading}><Text style={styles.sectionTitle}>Maintenance log</Text><Text style={styles.count}>{maintenanceRecords.length}</Text></View>
    <View style={styles.formCard}><Text style={styles.formTitle}>Record service or repair</Text>
      {motorcycles.length ? <View style={styles.chips}>{motorcycles.filter(bike=>bike.status==='active').map(bike=><Pressable key={bike.id} onPress={()=>setMaintenanceBikeId(bike.id)} style={[styles.chip,maintenanceBikeId===bike.id&&styles.chipActive]}><Text style={[styles.chipText,maintenanceBikeId===bike.id&&styles.chipTextActive]}>{bike.registration_number}</Text></Pressable>)}</View> : <Text style={styles.formHint}>Add a motorcycle before logging service.</Text>}
      <TextInput style={styles.input} value={serviceDate} onChangeText={setServiceDate} placeholder="Service date (YYYY-MM-DD)" placeholderTextColor="#94A1B5" maxLength={10}/>
      <TextInput style={[styles.input,styles.serviceDescription]} value={serviceDescription} onChangeText={setServiceDescription} multiline placeholder="What was repaired or serviced?" placeholderTextColor="#94A1B5" maxLength={1000}/>
      <View style={styles.row}><TextInput style={[styles.input,styles.flexInput]} value={serviceAmount} onChangeText={setServiceAmount} keyboardType="numeric" placeholder="Cost (RWF)" placeholderTextColor="#94A1B5"/><TextInput style={[styles.input,styles.flexInput]} value={odometerKm} onChangeText={setOdometerKm} keyboardType="number-pad" placeholder="Odometer km" placeholderTextColor="#94A1B5"/></View>
      <TextInput style={styles.input} value={nextServiceDate} onChangeText={setNextServiceDate} placeholder="Next service date (optional, YYYY-MM-DD)" placeholderTextColor="#94A1B5" maxLength={10}/>
      <Pressable style={[styles.button,savingService&&{opacity:.6}]} disabled={savingService||!motorcycles.length} onPress={addMaintenanceRecord}>{savingService?<ActivityIndicator color="#fff"/>:<Text style={styles.buttonText}>Save service record  →</Text>}</Pressable>
    </View>
    {maintenanceRecords.map(record=><View key={record.id} style={styles.serviceCard}><View style={styles.bikeIcon}><Ionicons name="construct-outline" size={20} color="#2869DF"/></View><View style={styles.bikeDetail}><Text style={styles.bikeTitle}>{record.description}</Text><Text style={styles.bikeMeta}>{motorcycles.find(bike=>bike.id===record.motorcycle_id)?.registration_number || 'Motorcycle'} · {record.service_date}</Text><Text style={styles.bikeMeta}>{new Intl.NumberFormat('en-RW',{style:'currency',currency:'RWF',maximumFractionDigits:0}).format(Number(record.amount))}{record.odometer_km ? ' · '+record.odometer_km.toLocaleString()+' km' : ''}</Text>{record.next_service_date&&<Text style={styles.serviceNext}>Next service: {record.next_service_date}</Text>}</View></View>)}
    {!loading&&!maintenanceRecords.length&&<Text style={styles.footnote}>No maintenance records have been added yet.</Text>}
    <Text style={styles.footnote}>Motorcycle information is user-entered until the relevant document or ownership record is verified.</Text>
  </ScrollView>;
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F6F8FC' }, content: { padding: 18, paddingBottom: 35 },
  kicker: { marginTop: 14, marginBottom: 7, color: '#7486A3', fontSize: 9, fontWeight: '800', letterSpacing: 1.1 },
  title: { color: '#1D304F', fontSize: 28, fontWeight: '800', letterSpacing: -.7 },
  subtitle: { color: '#8391A7', fontSize: 11, lineHeight: 17, marginTop: 7, marginBottom: 19 },
  formCard: { borderRadius: 17, borderWidth: 1, borderColor: '#E6ECF5', backgroundColor: '#FFF', padding: 16, marginBottom: 24 },
  formHint: { color: '#8996AB', fontSize: 10, lineHeight: 15, marginBottom: 12 },
  formTitle: { color: '#273A57', fontSize: 14, fontWeight: '800', marginBottom: 13 },
  input: { minHeight: 44, borderWidth: 1, borderColor: '#DFE7F2', borderRadius: 10, paddingHorizontal: 12, color: '#283A56', backgroundColor: '#FBFCFE', fontSize: 11, marginBottom: 11 },
  serviceDescription: { minHeight: 85, paddingTop: 11, textAlignVertical: 'top' },
  row: { flexDirection: 'row', gap: 9 }, flexInput: { flex: 1, minWidth: 0 },
  label: { color: '#65758F', fontSize: 10, fontWeight: '800', marginBottom: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 13 },
  chip: { borderWidth: 1, borderColor: '#E0E8F4', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: '#fff' },
  chipActive: { borderColor: '#A9C6F5', backgroundColor: '#EAF1FF' },
  chipText: { color: '#7A879B', fontSize: 9, fontWeight: '700' }, chipTextActive: { color: '#2869DF' },
  button: { minHeight: 45, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: '#2869DF', marginTop: 2 },
  buttonText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  secondaryButton: { minHeight: 43, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 10, backgroundColor: '#EEF4FF', borderWidth: 1, borderColor: '#DCE8FC', marginBottom: 10, paddingHorizontal: 10 },
  secondaryButtonText: { color: '#2869DF', fontSize: 10, fontWeight: '800' },
  documentCard: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 13, backgroundColor: '#fff', borderColor: '#E7EDF5', borderWidth: 1, marginBottom: 8 },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  sectionTitle: { color: '#263954', fontSize: 16, fontWeight: '800' },
  count: { color: '#2869DF', backgroundColor: '#E6EEFF', borderRadius: 7, overflow: 'hidden', paddingHorizontal: 8, paddingVertical: 4, fontSize: 9, fontWeight: '800' },
  serviceCard: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 13, borderRadius: 13, backgroundColor: '#fff', borderColor: '#E7EDF5', borderWidth: 1, marginBottom: 9 },
  serviceNext: { color: '#2C7A65', fontSize: 9, fontWeight: '700', marginTop: 4 },
  bikeCard: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 13, borderRadius: 13, backgroundColor: '#fff', borderColor: '#E7EDF5', borderWidth: 1, marginBottom: 9 },
  bikeIcon: { width: 41, height: 41, borderRadius: 12, backgroundColor: '#EAF1FF', alignItems: 'center', justifyContent: 'center' },
  bikeDetail: { flex: 1, minWidth: 0 }, bikeTitle: { color: '#344560', fontSize: 11, fontWeight: '800', marginBottom: 4 },
  bikeMeta: { color: '#8A97AC', fontSize: 9, marginBottom: 3, textTransform: 'capitalize' },
  moreButton: { width: 32, height: 34, alignItems: 'center', justifyContent: 'center' },
  empty: { alignItems: 'center', padding: 25, borderRadius: 14, borderStyle: 'dashed', borderWidth: 1, borderColor: '#DCE5F4', backgroundColor: '#FCFDFF' },
  emptyTitle: { color: '#354861', fontWeight: '800', fontSize: 13, marginTop: 9 }, emptyText: { color: '#8996AB', fontSize: 10, textAlign: 'center', marginTop: 5, lineHeight: 15 },
  footnote: { color: '#9AA5B6', fontSize: 9, lineHeight: 15, marginTop: 17 },
});
