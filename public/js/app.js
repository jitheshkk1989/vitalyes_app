/**
 * Vitalyes Phase 1 registration, appointment and invoicing prototype.
 * Storage and integrations remain synthetic JSON-backed demonstrations.
 */
const state = {
  lang: 'en',
  sessionId: null,
  mobile: null,
  phoneCountry: 'IN',
  geography: null,
  mrn: null,
  identityMode: 'mobile',
  visitIntent: 'new',
  isNewPatient: false,
  patient: null,
  doctor: null,
  slot: null,
  appointmentDate: null,
  invoice: null,
  payment: null,
  token: null,
  config: null,
  staff: null,
  oidcConfigured: false,
  adminCredentialsConfigured: false,
  adminLoginAvailable: false,
  localLoginAvailable: false,
  demoAdminDefaultCredentials: false,
  adminUnlocked: false,
  settingsGroup: 'facility',
  staffPage: null,
  adminConfig: null,
  doctors: [],
  departments: []
};

const $ = selector => document.querySelector(selector);
const main = () => $('#main');
const t = key => (translations[state.lang] || translations.en)[key] || translations.en[key] || key;
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[char]));
const currency = amount => `${state.config?.currencySymbol || '₹'}${Number(amount || 0).toLocaleString('en-IN')}`;

const translations = {
  en: {
    welcome: 'Welcome to Vitalyes', chooseLanguage: 'Choose your language', doctorsVisit: 'Doctors Visit',
    newPatient: 'New Patient Registration', review: 'Review / Follow-up', revisit: 'Revisit / New Consultation',
    reports: 'Daily Operations Report', selectAction: 'Select a service to continue',
    mobileOrMrn: 'Identify Patient', mobile: 'Mobile number', mrn: 'Medical Record Number (MRN)', doctor: 'Doctor', appointments: 'Appointments',
    sendOtp: 'Send verification code', verify: 'Verify code', otp: 'One-time password',
    existingTitle: 'Existing patient identified', existingMessage: 'We have identified your existing patient record. Please verify your details and proceed.',
    mrnLabel: 'MRN', dob: 'Date of birth', gender: 'Gender', address: 'Address', postOffice: 'Post Office',
    district: 'District', state: 'State', pin: 'PIN Code', firstName: 'First name', lastName: 'Last name',
    alternateMobile: 'Alternate mobile (optional)', email: 'Email (optional)', bloodGroup: 'Blood group (optional)',
    select: 'Select', register: 'Register and continue', chooseDate: 'Choose appointment date',
    availableDates: 'Dates with available doctor schedules', chooseDoctor: 'Choose department or search for a doctor',
    department: 'Department', allDepartments: 'All departments', searchDoctor: 'Search doctor name',
    previousDoctor: 'Your previous consulting doctor', continue: 'Continue', chooseSlot: 'Choose appointment time',
    noSlots: 'No slots available for this date.', suggestedDates: 'Suggested available dates',
    invoice: 'Invoice', visitCategory: 'Visit category', appointment: 'Appointment',
    registrationFee: 'Registration fee', consultationFee: 'Consultation fee', total: 'Total payable',
    pay: 'Proceed to simulated payment', paymentMethod: 'Payment method',
    upi: 'UPI', card: 'Debit / Credit card', netBanking: 'Net banking', cash: 'Cash at authorised counter',
    successful: 'Simulate successful payment', failed: 'Simulate payment failure', counterConfirm: 'Confirm authorised counter payment',
    receipt: 'Appointment confirmed', token: 'Token number', scheduledTime: 'Scheduled time',
    paymentStatus: 'Payment status', paid: 'Paid (simulated)', counter: 'Authorised counter payment',
    startOver: 'Start a new registration', back: 'Back', date: 'Report date', loadReport: 'Load report',
    registrations: 'New registrations', patients: 'Patients', bookings: 'Appointments',
    newConsultations: 'New consultations', reviews: 'Free reviews', revisits: 'Chargeable revisits',
    invoiced: 'Amount invoiced', collected: 'Amount collected', departmentBreakdown: 'Department bookings',
    required: 'Please complete all required fields.', enterMobile: 'Enter a valid 10-digit mobile number.',
    countryCode: 'Phone country code', country: 'Country', internationalPhone: 'Enter a possible phone number with country code.',
    registrationType: 'Registration type', postalCode: 'Postal code (optional)', pinError: 'Enter a valid 6-digit Indian PIN code.',
    otherLocation: 'Other / not listed', enterState: 'Enter state', enterDistrict: 'Enter district',
    typeNotice: 'This records the registration type only. Inpatient and emergency workflows are not available in this prototype.',
    verifyDetails: 'Verify details', noHistory: 'No previous consultation found. This will be treated as a new consultation.',
    reviewExpires: 'Free review eligible through', reviewNotEligible: 'Free review period has expired; revisit charges apply.',
    daysAvailable: 'Schedule-based dates only', reportError: 'Could not load the report.',
    markComplete: 'Mark consultation complete', completed: 'Completed'
  },
  hi: {
    welcome: 'Vitalyes में आपका स्वागत है', chooseLanguage: 'अपनी भाषा चुनें', doctorsVisit: 'डॉक्टर से परामर्श',
    newPatient: 'नया रोगी पंजीकरण', review: 'रिव्यू / फॉलो-अप', revisit: 'दोबारा / नया परामर्श',
    reports: 'दैनिक संचालन रिपोर्ट', selectAction: 'जारी रखने के लिए सेवा चुनें',
    mobileOrMrn: 'रोगी की पहचान', mobile: 'मोबाइल नंबर', mrn: 'मेडिकल रिकॉर्ड नंबर (MRN)', doctor: 'डॉक्टर', appointments: 'अपॉइंटमेंट',
    sendOtp: 'सत्यापन कोड भेजें', verify: 'कोड सत्यापित करें', otp: 'वन-टाइम पासवर्ड',
    existingTitle: 'मौजूदा रोगी की पहचान हुई', existingMessage: 'हमने आपका मौजूदा रोगी रिकॉर्ड पहचान लिया है। कृपया विवरण जांचकर आगे बढ़ें।',
    mrnLabel: 'MRN', dob: 'जन्म तिथि', gender: 'लिंग', address: 'पता', postOffice: 'डाकघर',
    district: 'जिला', state: 'राज्य', pin: 'पिन कोड', firstName: 'पहला नाम', lastName: 'अंतिम नाम',
    alternateMobile: 'वैकल्पिक मोबाइल (वैकल्पिक)', email: 'ईमेल (वैकल्पिक)', bloodGroup: 'रक्त समूह (वैकल्पिक)',
    select: 'चुनें', register: 'पंजीकरण करें और आगे बढ़ें', chooseDate: 'अपॉइंटमेंट की तारीख चुनें',
    availableDates: 'डॉक्टर के उपलब्ध शेड्यूल वाली तारीखें', chooseDoctor: 'विभाग चुनें या डॉक्टर खोजें',
    department: 'विभाग', allDepartments: 'सभी विभाग', searchDoctor: 'डॉक्टर का नाम खोजें',
    previousDoctor: 'आपके पिछले डॉक्टर', continue: 'आगे बढ़ें', chooseSlot: 'अपॉइंटमेंट का समय चुनें',
    noSlots: 'इस तारीख के लिए स्लॉट उपलब्ध नहीं हैं।', suggestedDates: 'सुझाई गई उपलब्ध तारीखें',
    invoice: 'चालान', visitCategory: 'विज़िट श्रेणी', appointment: 'अपॉइंटमेंट',
    registrationFee: 'पंजीकरण शुल्क', consultationFee: 'परामर्श शुल्क', total: 'कुल देय',
    pay: 'सिम्युलेटेड भुगतान पर जाएं', paymentMethod: 'भुगतान का तरीका',
    upi: 'UPI', card: 'डेबिट / क्रेडिट कार्ड', netBanking: 'नेट बैंकिंग', cash: 'अधिकृत काउंटर पर नकद',
    successful: 'सफल भुगतान सिम्युलेट करें', failed: 'भुगतान विफलता सिम्युलेट करें', counterConfirm: 'अधिकृत काउंटर भुगतान की पुष्टि करें',
    receipt: 'अपॉइंटमेंट की पुष्टि हुई', token: 'टोकन नंबर', scheduledTime: 'निर्धारित समय',
    paymentStatus: 'भुगतान स्थिति', paid: 'भुगतान किया (सिम्युलेटेड)', counter: 'अधिकृत काउंटर भुगतान',
    startOver: 'नया पंजीकरण शुरू करें', back: 'वापस', date: 'रिपोर्ट की तारीख', loadReport: 'रिपोर्ट देखें',
    registrations: 'नए पंजीकरण', patients: 'रोगी', bookings: 'अपॉइंटमेंट',
    newConsultations: 'नए परामर्श', reviews: 'निःशुल्क रिव्यू', revisits: 'शुल्कयुक्त रीविज़िट',
    invoiced: 'कुल चालान', collected: 'कुल संग्रह', departmentBreakdown: 'विभाग अनुसार बुकिंग',
    required: 'कृपया सभी आवश्यक फ़ील्ड भरें।', enterMobile: '10 अंकों का सही मोबाइल नंबर दर्ज करें।',
    countryCode: 'फोन देश कोड', country: 'देश', internationalPhone: 'देश कोड सहित सही फोन नंबर दर्ज करें।',
    registrationType: 'पंजीकरण प्रकार', postalCode: 'डाक कोड (वैकल्पिक)', pinError: '6 अंकों का भारतीय पिन कोड दर्ज करें।',
    otherLocation: 'अन्य / सूची में नहीं', enterState: 'राज्य दर्ज करें', enterDistrict: 'जिला दर्ज करें',
    typeNotice: 'यह केवल पंजीकरण प्रकार दर्ज करता है। इस प्रोटोटाइप में भर्ती और आपातकालीन प्रक्रियाएं उपलब्ध नहीं हैं।',
    verifyDetails: 'विवरण जांचें', noHistory: 'पिछला परामर्श नहीं मिला। इसे नया परामर्श माना जाएगा।',
    reviewExpires: 'इस तारीख तक निःशुल्क रिव्यू', reviewNotEligible: 'निःशुल्क रिव्यू अवधि समाप्त; रीविज़िट शुल्क लागू होगा।',
    daysAvailable: 'केवल शेड्यूल-आधारित तारीखें', reportError: 'रिपोर्ट लोड नहीं हो सकी।',
    markComplete: 'परामर्श पूरा चिह्नित करें', completed: 'पूरा हुआ'
  },
  ml: {
    welcome: 'Vitalyes-ലേക്ക് സ്വാഗതം', chooseLanguage: 'ഭാഷ തിരഞ്ഞെടുക്കുക', doctorsVisit: 'ഡോക്ടറെ കാണുക',
    newPatient: 'പുതിയ രോഗി രജിസ്ട്രേഷൻ', review: 'റിവ്യൂ / ഫോളോ-അപ്പ്', revisit: 'വീണ്ടും / പുതിയ കൺസൾട്ടേഷൻ',
    reports: 'ദൈനംദിന പ്രവർത്തന റിപ്പോർട്ട്', selectAction: 'തുടരാൻ ഒരു സേവനം തിരഞ്ഞെടുക്കുക',
    mobileOrMrn: 'രോഗിയെ തിരിച്ചറിയുക', mobile: 'മൊബൈൽ നമ്പർ', mrn: 'മെഡിക്കൽ റെക്കോർഡ് നമ്പർ (MRN)', doctor: 'ഡോക്ടർ', appointments: 'അപ്പോയിന്റ്മെന്റുകൾ',
    sendOtp: 'സ്ഥിരീകരണ കോഡ് അയയ്ക്കുക', verify: 'കോഡ് പരിശോധിക്കുക', otp: 'ഒറ്റത്തവണ പാസ്‌വേഡ്',
    existingTitle: 'നിലവിലുള്ള രോഗിയെ തിരിച്ചറിഞ്ഞു', existingMessage: 'നിങ്ങളുടെ നിലവിലുള്ള രോഗി രേഖ കണ്ടെത്തി. വിവരങ്ങൾ പരിശോധിച്ച് തുടരുക.',
    mrnLabel: 'MRN', dob: 'ജനനത്തീയതി', gender: 'ലിംഗം', address: 'വിലാസം', postOffice: 'പോസ്റ്റ് ഓഫീസ്',
    district: 'ജില്ല', state: 'സംസ്ഥാനം', pin: 'പിൻ കോഡ്', firstName: 'പേര്', lastName: 'കുടുംബപ്പേര്',
    alternateMobile: 'മറ്റൊരു മൊബൈൽ (ഐച്ഛികം)', email: 'ഇമെയിൽ (ഐച്ഛികം)', bloodGroup: 'രക്തഗ്രൂപ്പ് (ഐച്ഛികം)',
    select: 'തിരഞ്ഞെടുക്കുക', register: 'രജിസ്റ്റർ ചെയ്ത് തുടരുക', chooseDate: 'അപ്പോയിന്റ്മെന്റ് തീയതി തിരഞ്ഞെടുക്കുക',
    availableDates: 'ഡോക്ടറുടെ ഷെഡ്യൂൾ ലഭ്യമായ തീയതികൾ', chooseDoctor: 'വിഭാഗം തിരഞ്ഞെടുക്കുക അല്ലെങ്കിൽ ഡോക്ടറെ തിരയുക',
    department: 'വിഭാഗം', allDepartments: 'എല്ലാ വിഭാഗങ്ങളും', searchDoctor: 'ഡോക്ടറുടെ പേര് തിരയുക',
    previousDoctor: 'മുൻപ് കണ്ട ഡോക്ടർ', continue: 'തുടരുക', chooseSlot: 'അപ്പോയിന്റ്മെന്റ് സമയം തിരഞ്ഞെടുക്കുക',
    noSlots: 'ഈ തീയതിയിൽ സ്ലോട്ടുകൾ ലഭ്യമല്ല.', suggestedDates: 'നിർദ്ദേശിക്കുന്ന ലഭ്യമായ തീയതികൾ',
    invoice: 'ഇൻവോയ്സ്', visitCategory: 'സന്ദർശന വിഭാഗം', appointment: 'അപ്പോയിന്റ്മെന്റ്',
    registrationFee: 'രജിസ്ട്രേഷൻ ഫീസ്', consultationFee: 'കൺസൾട്ടേഷൻ ഫീസ്', total: 'ആകെ അടയ്ക്കേണ്ടത്',
    pay: 'സിമുലേറ്റഡ് പേയ്‌മെന്റിലേക്ക് തുടരുക', paymentMethod: 'പേയ്‌മെന്റ് രീതി',
    upi: 'UPI', card: 'ഡെബിറ്റ് / ക്രെഡിറ്റ് കാർഡ്', netBanking: 'നെറ്റ് ബാങ്കിംഗ്', cash: 'അംഗീകൃത കൗണ്ടറിൽ പണം',
    successful: 'വിജയകരമായ പേയ്‌മെന്റ് സിമുലേറ്റ് ചെയ്യുക', failed: 'പേയ്‌മെന്റ് പരാജയം സിമുലേറ്റ് ചെയ്യുക', counterConfirm: 'അംഗീകൃത കൗണ്ടർ പേയ്‌മെന്റ് സ്ഥിരീകരിക്കുക',
    receipt: 'അപ്പോയിന്റ്മെന്റ് സ്ഥിരീകരിച്ചു', token: 'ടോക്കൺ നമ്പർ', scheduledTime: 'നിശ്ചയിച്ച സമയം',
    paymentStatus: 'പേയ്‌മെന്റ് നില', paid: 'അടച്ചു (സിമുലേറ്റഡ്)', counter: 'അംഗീകൃത കൗണ്ടർ പേയ്‌മെന്റ്',
    startOver: 'പുതിയ രജിസ്ട്രേഷൻ തുടങ്ങുക', back: 'തിരികെ', date: 'റിപ്പോർട്ട് തീയതി', loadReport: 'റിപ്പോർട്ട് കാണുക',
    registrations: 'പുതിയ രജിസ്ട്രേഷനുകൾ', patients: 'രോഗികൾ', bookings: 'അപ്പോയിന്റ്മെന്റുകൾ',
    newConsultations: 'പുതിയ കൺസൾട്ടേഷനുകൾ', reviews: 'സൗജന്യ റിവ്യൂകൾ', revisits: 'ഫീസ് ബാധകമായ റിവിസിറ്റുകൾ',
    invoiced: 'ഇൻവോയ്സ് തുക', collected: 'ശേഖരിച്ച തുക', departmentBreakdown: 'വിഭാഗം തിരിച്ചുള്ള ബുക്കിംഗുകൾ',
    required: 'ആവശ്യമായ എല്ലാ വിവരങ്ങളും നൽകുക.', enterMobile: 'ശരിയായ 10 അക്ക മൊബൈൽ നമ്പർ നൽകുക.',
    countryCode: 'ഫോൺ രാജ്യ കോഡ്', country: 'രാജ്യം', internationalPhone: 'രാജ്യ കോഡിനൊപ്പം ശരിയായ ഫോൺ നമ്പർ നൽകുക.',
    registrationType: 'രജിസ്ട്രേഷൻ തരം', postalCode: 'പോസ്റ്റൽ കോഡ് (ഐച്ഛികം)', pinError: '6 അക്ക ഇന്ത്യൻ പിൻ കോഡ് നൽകുക.',
    otherLocation: 'മറ്റുള്ളവ / പട്ടികയിൽ ഇല്ല', enterState: 'സംസ്ഥാനം നൽകുക', enterDistrict: 'ജില്ല നൽകുക',
    typeNotice: 'രജിസ്ട്രേഷൻ തരം മാത്രം രേഖപ്പെടുത്തുന്നു. അഡ്മിഷൻ, അത്യാഹിത വിഭാഗ നടപടികൾ ഈ പ്രോട്ടോടൈപ്പിൽ ലഭ്യമല്ല.',
    verifyDetails: 'വിവരങ്ങൾ പരിശോധിക്കുക', noHistory: 'മുൻ കൺസൾട്ടേഷൻ കണ്ടെത്തിയില്ല. ഇത് പുതിയ കൺസൾട്ടേഷനായി കണക്കാക്കും.',
    reviewExpires: 'ഈ തീയതി വരെ സൗജന്യ റിവ്യൂ അർഹത', reviewNotEligible: 'സൗജന്യ റിവ്യൂ കാലാവധി കഴിഞ്ഞു; റിവിസിറ്റ് ഫീസ് ബാധകമാണ്.',
    daysAvailable: 'ഷെഡ്യൂൾ അടിസ്ഥാനത്തിലുള്ള തീയതികൾ മാത്രം', reportError: 'റിപ്പോർട്ട് ലോഡ് ചെയ്യാനായില്ല.',
    markComplete: 'കൺസൾട്ടേഷൻ പൂർത്തിയാക്കുക', completed: 'പൂർത്തിയായി'
  }
};

async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (state.sessionId) headers['x-session-id'] = state.sessionId;
  const response = await fetch(`/api${path}`, { credentials: 'same-origin', ...options, headers });
  const data = await response.json();
  if (!response.ok || !data.success) throw new Error(data.message || 'Request failed');
  return data;
}

async function adminApi(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  const response = await fetch(`/api/admin${path}`, {
    credentials: 'same-origin',
    ...options,
    headers
  });
  const data = await response.json();
  if (!response.ok || !data.success) throw new Error(data.message || 'Request failed');
  return data;
}

function toast(message, duration = 3200) {
  const element = $('#toast');
  element.textContent = message;
  element.hidden = false;
  element.classList.add('show');
  setTimeout(() => {
    element.hidden = true;
    element.classList.remove('show');
  }, duration);
}

function setHomeButton(visible = true) {
  $('#btn-home').style.display = visible ? 'inline-block' : 'none';
}

function renderWelcome() {
  setAdminLayout(false);
  $('#app').classList.remove('bi-mode');
  $('#app').classList.add('welcome-mode');
  $('#main').classList.remove('admin-main');
  setHomeButton(false);
  main().innerHTML = `
    <section class="screen welcome-screen">
      <div class="welcome-layout">
        <section class="welcome-language" aria-labelledby="welcome-title">
          <span class="welcome-eyebrow">PATIENT SERVICES</span>
          <h1 id="welcome-title">${t('welcome')}</h1>
          <p class="welcome-intro">A simpler way to begin your visit.</p>
          <div class="welcome-language-heading">
            <span class="welcome-step">01</span>
            <div><h2>${t('chooseLanguage')}</h2><p>Select a language to continue</p></div>
          </div>
          <div id="language-options" class="welcome-options"></div>
          <div class="welcome-staff">
            <div><strong>Hospital staff?</strong><p>Access your secure workspace.</p></div>
            <button type="button" id="btn-welcome-staff">${state.staff ? 'Open staff portal' : 'Staff / admin login'} <span aria-hidden="true">→</span></button>
          </div>
        </section>
        <aside class="welcome-updates" aria-labelledby="welcome-updates-title">
          <div class="welcome-updates-header">
            <span class="welcome-eyebrow">STAY INFORMED</span>
            <h2 id="welcome-updates-title">News &amp; updates</h2>
            <p>Information from your hospital, all in one place.</p>
          </div>
          <div class="welcome-update-card">
            <span class="welcome-update-label">NEWS &amp; FEEDS</span>
            <h3>No updates available</h3>
            <p>Hospital news and feeds will appear here when available.</p>
          </div>
          <div class="welcome-ad-card">
            <span class="welcome-update-label">ADVERTISEMENT</span>
            <p>No advertisements available.</p>
          </div>
          <div class="welcome-notice">Prototype only · Synthetic data · No real OTP or payments</div>
        </aside>
      </div>
    </section>`;
  const options = $('#language-options');
  (state.config?.languages || []).forEach(language => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'welcome-language-option';
    button.lang = language.code;
    const label = document.createElement('span');
    label.textContent = language.label;
    const arrow = document.createElement('span');
    arrow.className = 'welcome-option-arrow';
    arrow.setAttribute('aria-hidden', 'true');
    arrow.textContent = '→';
    button.append(label, arrow);
    button.onclick = () => {
      state.lang = language.code;
      document.documentElement.lang = language.code;
      renderHome();
    };
    options.appendChild(button);
  });
  $('#btn-welcome-staff').onclick = () => navigateStaffPage('admin');
}

function renderHome() {
  setAdminLayout(false);
  $('#app').classList.remove('welcome-mode');
  $('#main').classList.remove('admin-main');
  $('#app').classList.remove('bi-mode');
  setHomeButton(true);
  main().innerHTML = `
    <section class="screen">
      <h1 class="screen-title">${t('doctorsVisit')}</h1>
      <p class="screen-subtitle">${t('selectAction')}</p>
      <div class="option-grid patient-services">
        <button class="option-card" data-intent="new"><span class="icon">📝</span>${t('newPatient')}</button>
        <button class="option-card" data-intent="followup"><span class="icon">🔄</span>${t('review')}</button>
        <button class="option-card" data-intent="followup"><span class="icon">🩺</span>${t('revisit')}</button>
      </div>
      <section class="staff-entry">
        <div>
          <span class="staff-entry-eyebrow">STAFF WORKSPACE</span>
          <h2>Administration &amp; Intelligence</h2>
          <p>${state.staff
            ? `Signed in as ${escapeHtml(state.staff.name)}. Open the role-authorized staff workspace.`
            : 'Secure access to hospital administration, settings, and analytics.'}</p>
        </div>
        <button class="btn btn-primary btn-compact" id="btn-staff-portal">${state.staff ? 'Open admin portal' : 'Staff login'}</button>
      </section>
    </section>`;
  document.querySelectorAll('[data-intent]').forEach(button => {
    button.onclick = () => { state.visitIntent = button.dataset.intent; renderIdentity(); };
  });
  $('#btn-staff-portal').onclick = () => navigateStaffPage('admin');
}

function staffNavigation(activePage) {
  const links = [
    ['admin', '▦', 'Overview'],
    ...(state.staff?.canViewDailyReport ? [['reports', '▤', 'Daily operations']] : []),
    ...(state.staff?.reportView ? [['analytics', '◷', 'Analytics']] : []),
    ...(state.staff?.canManageSettings ? [['settings', '⚙', 'Settings']] : [])
  ];
  return `
    <aside class="admin-sidebar">
      <div class="admin-sidebar-heading"><span class="admin-sidebar-mark">V</span><span>STAFF PORTAL</span></div>
      <div class="admin-nav-label">WORKSPACE</div>
      <nav class="admin-nav" aria-label="Staff workspace">
        ${links.map(([page, icon, label]) => `
          <div class="admin-nav-item">
            <button class="admin-nav-link ${activePage === page ? 'active' : ''}" data-staff-page="${page}" ${activePage === page ? 'aria-current="page"' : ''}><span>${icon}</span>${label}</button>
            ${page === 'settings' && activePage === 'settings' && state.adminUnlocked ? `
              <nav class="settings-subnav" aria-label="Settings categories">
                ${[
                  ['facility', 'Hospital & languages'],
                  ['care', 'Departments & doctors'],
                  ['visits', 'Fees & visit rules'],
                  ['payments', 'Payments'],
                  ...(state.localLoginAvailable ? [['users', 'Staff users']] : []),
                  ['access', 'Roles & access'],
                  ['reports', 'Reports']
                ].map(([group, title]) => `<button class="settings-subnav-link ${state.settingsGroup === group ? 'active' : ''}" data-settings-group="${group}" ${state.settingsGroup === group ? 'aria-current="page"' : ''}>${title}</button>`).join('')}
              </nav>
            ` : ''}
          </div>`).join('')}
      </nav>
      <div class="admin-sidebar-bottom">
        <div class="admin-user"><span class="admin-user-avatar">${escapeHtml((state.staff?.name || 'S').charAt(0).toUpperCase())}</span><span><strong>${escapeHtml(state.staff?.name || 'Staff')}</strong><small>${escapeHtml((state.staff?.roles || []).join(', '))}</small></span></div>
        <button class="admin-nav-link" id="btn-staff-patient-services"><span>←</span>Patient services</button>
        <button class="admin-nav-link admin-signout" id="btn-staff-logout"><span>↪</span>Sign out</button>
      </div>
    </aside>`;
}

function attachAdminNavigation(activePage) {
  $('#main').classList.add('admin-main');
  $('#main').insertAdjacentHTML('afterbegin', staffNavigation(activePage));
  document.querySelectorAll('[data-staff-page]').forEach(button => {
    button.onclick = () => navigateStaffPage(button.dataset.staffPage);
  });
  document.querySelectorAll('.settings-subnav-link[data-settings-group]').forEach(button => {
    button.onclick = () => setSettingsGroup(button.dataset.settingsGroup);
  });
  $('#btn-staff-patient-services').onclick = async () => {
    try {
      if (state.adminUnlocked) await adminApi('/logout', { method: 'POST' });
      state.adminUnlocked = false;
      state.adminConfig = null;
      $('#main').classList.remove('admin-main');
      $('#app').classList.remove('admin-mode', 'bi-mode');
      window.history.replaceState({}, '', '/');
      renderHome();
    } catch (error) {
      toast(`Could not lock settings: ${error.message}`);
    }
  };
  $('#btn-staff-logout').onclick = signOutStaff;
}

function setSettingsGroup(group) {
  state.settingsGroup = group;
  document.querySelectorAll('.settings-section[data-settings-group]').forEach(section => {
    section.hidden = section.dataset.settingsGroup !== group;
  });
  document.querySelectorAll('.settings-subnav-link').forEach(button => {
    const active = button.dataset.settingsGroup === group;
    button.classList.toggle('active', active);
    if (active) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
  const activeButton = document.querySelector(`.settings-subnav-link[data-settings-group="${group}"]`);
  const heading = $('#settings-group-title');
  if (heading && activeButton) heading.textContent = activeButton.textContent;
}

function renderStaffLogin(requestedPage = 'admin') {
  state.staffPage = requestedPage;
  setAdminLayout(true);
  $('#app').classList.remove('bi-mode');
  $('#main').classList.remove('admin-main');
  setHomeButton(false);
  main().innerHTML = `
    <section class="admin-login">
      <div class="admin-login-brand"><span class="admin-sidebar-mark">V</span><span>Vitalyes <small>STAFF PORTAL</small></span></div>
      <div class="admin-login-card">
        <div class="admin-login-icon">🔐</div>
        <span class="staff-entry-eyebrow">SECURE WORKSPACE</span>
        <h1>Staff sign in</h1>
        <p>Sign in to access administration, settings, and analytics.</p>
        ${state.localLoginAvailable ? `
          <form class="admin-demo-login" id="staff-login-form">
            <h2>Username and password</h2>
            ${state.demoAdminDefaultCredentials ? '<p>Demo credentials: username <strong>admin</strong>, password <strong>admin</strong>. Local development only.</p>' : ''}
            <div class="form-group">
              <label for="staff-admin-username">Username</label>
              <input id="staff-admin-username" class="form-control" type="text" autocomplete="username" required>
            </div>
            <div class="form-group">
              <label for="staff-admin-password">Password</label>
              <input id="staff-admin-password" class="form-control" type="password" autocomplete="current-password" required>
            </div>
            <div id="staff-admin-login-error" class="error-box" hidden></div>
            <button class="btn btn-primary" id="btn-local-admin-login" type="submit">Sign in</button>
          </form>
        ` : '<div class="admin-login-notice">Local staff sign-in is available only in prototype mode.</div>'}
        ${state.oidcConfigured ? '<button class="btn btn-outline" id="btn-oidc-login">Continue with staff identity provider</button>' : ''}
        <button class="btn btn-outline" id="btn-login-patient">Return to patient services</button>
      </div>
      <p class="admin-login-footer">Access is limited by your assigned hospital and staff role.</p>
    </section>`;
  $('#btn-oidc-login')?.addEventListener('click', () => {
    sessionStorage.setItem('vitalyes.staffPage', requestedPage);
    window.location.href = '/api/auth/login';
  });
  $('#staff-login-form')?.addEventListener('submit', async event => {
    event.preventDefault();
    const button = $('#btn-local-admin-login');
    const errorBox = $('#staff-admin-login-error');
    const username = $('#staff-admin-username').value;
    const password = $('#staff-admin-password').value;
    if (!username || !password) {
      errorBox.textContent = 'Enter your username and password.';
      errorBox.hidden = false;
      return;
    }
    button.disabled = true;
    errorBox.hidden = true;
    try {
      await api('/auth/local-login', {
        method: 'POST',
        body: JSON.stringify({ username, password })
      });
      const auth = await api('/auth/session');
      state.staff = auth.staff;
      state.adminUnlocked = auth.adminUnlocked;
      navigateStaffPage(requestedPage, false);
    } catch (error) {
      errorBox.textContent = error.message;
      errorBox.hidden = false;
      button.disabled = false;
    }
  });
  $('#btn-login-patient').onclick = () => {
    sessionStorage.removeItem('vitalyes.staffPage');
    $('#main').classList.remove('admin-main');
    window.history.replaceState({}, '', '/');
    renderHome();
  };
}

function renderAdminPortal() {
  if (!state.staff) return renderStaffLogin('admin');
  setAdminLayout(true);
  $('#app').classList.remove('bi-mode');
  setHomeButton(false);
  const modules = [
    ...(state.staff.canViewDailyReport ? [['reports', '▤', 'Daily operations', 'Registration, appointments, collections, and patient flow']] : []),
    ...(state.staff.reportView ? [['analytics', '◷', 'Analytics', 'Role-scoped hospital performance and reporting']] : []),
    ...(state.staff.canManageSettings ? [['settings', '⚙', 'Settings', 'Hospital, departments, doctors, schedules, and rules']] : [])
  ];
  main().innerHTML = `
    <section class="screen admin-dashboard">
      <div class="admin-page-heading"><div><span class="staff-entry-eyebrow">HOSPITAL WORKSPACE</span><h1>Admin overview</h1><p>Welcome, ${escapeHtml(state.staff.name)}. Open a workspace available to your role.</p></div><span class="admin-hospital-badge">${escapeHtml(state.config.hospitalName)}</span></div>
      <div class="admin-overview-grid">
        ${modules.map(([page, icon, title, description]) => `<button class="admin-module-card" data-staff-page="${page}"><span class="admin-module-icon">${icon}</span><span><strong>${title}</strong><small>${description}</small></span><b>→</b></button>`).join('') || '<div class="card admin-access-note">No administration or reporting modules are assigned to your staff role. Contact your hospital administrator if you need access.</div>'}
      </div>
      <div class="card admin-access-note"><strong>Your access follows your assigned role.</strong><p>Only authorized pages are shown in the navigation. Settings changes also require administrator credentials.</p></div>
    </section>`;
  attachAdminNavigation('admin');
  document.querySelectorAll('[data-staff-page]').forEach(button => {
    button.onclick = () => navigateStaffPage(button.dataset.staffPage);
  });
}

function navigateStaffPage(page, updateHistory = true) {
  const validPages = ['admin', 'reports', 'analytics', 'settings'];
  if (!validPages.includes(page)) page = 'admin';
  state.staffPage = page;
  if (updateHistory && window.location.hash !== `#/${page}`) {
    window.history.pushState({ staffPage: page }, '', `#/${page}`);
  } else if (!updateHistory && window.location.hash !== `#/${page}`) {
    window.history.replaceState({ staffPage: page }, '', `#/${page}`);
  }
  if (!state.staff) return renderStaffLogin(page);
  if (page === 'settings' && !state.staff.canManageSettings) {
    toast('Your staff role does not allow access to settings.');
    return renderAdminPortal();
  }
  if (page === 'analytics' && !state.staff.reportView) {
    toast('Your staff role does not allow access to analytics.');
    return renderAdminPortal();
  }
  if (page === 'reports' && !state.staff.canViewDailyReport) {
    toast('Your staff role does not allow access to daily operations reports.');
    return renderAdminPortal();
  }
  if (page === 'settings') return renderAdminAccess();
  if (page === 'analytics') return renderAnalytics();
  if (page === 'reports') return renderReport();
  renderAdminPortal();
}

async function signOutStaff() {
  try {
    const response = await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
    if (!response.ok) throw new Error('Sign-out request was rejected');
    state.staff = null;
    state.adminUnlocked = false;
    state.adminConfig = null;
    state.analyticsReport = null;
    state.staffPage = null;
    sessionStorage.removeItem('vitalyes.staffPage');
    window.history.replaceState({}, '', '/');
    renderHome();
  } catch (error) {
    toast(`Could not sign out: ${error.message}`);
  }
}

function renderIdentity() {
  setHomeButton(true);
  state.identityMode = 'mobile';
  main().innerHTML = `
    <section class="screen">
      <h1 class="screen-title">${t('mobileOrMrn')}</h1>
      <div class="btn-row">
        <button class="btn btn-outline" id="mode-mobile">${t('mobile')}</button>
        <button class="btn btn-outline" id="mode-mrn">${t('mrn')}</button>
      </div>
      <div class="card" id="identity-form"></div>
      <button class="btn btn-outline" id="btn-back">${t('back')}</button>
    </section>`;
  const renderForm = mode => {
    state.identityMode = mode;
    const mrnMode = mode === 'mrn';
    $('#identity-form').innerHTML = `
      ${mrnMode ? '' : `<div class="form-group">
        <label for="phone-country">${t('countryCode')}</label>
        <select id="phone-country" class="form-control">${state.geography.countries.map(country =>
          `<option value="${escapeHtml(country.code)}" ${country.code === state.phoneCountry ? 'selected' : ''}>${escapeHtml(country.name)} (${escapeHtml(country.callingCode)})</option>`).join('')}</select>
      </div>`}
      <div class="form-group">
        <label for="identity-value">${mrnMode ? t('mrn') : t('mobile')}</label>
        <input id="identity-value" class="form-control" ${mrnMode ? 'type="text" autocomplete="off"' : 'type="tel" inputmode="numeric" maxlength="15"'} required />
      </div>
      <button class="btn btn-primary" id="btn-send">${t('sendOtp')}</button>`;
    $('#btn-send').onclick = async () => {
      const value = $('#identity-value').value.trim();
      try {
        let response;
        if (mrnMode) {
          if (!value) return toast(t('required'));
          state.mrn = value;
          response = await api('/identity/mrn', { method: 'POST', body: JSON.stringify({ mrn: value }) });
        } else {
          if (!/^\d{4,15}$/.test(value)) return toast(t('internationalPhone'));
          state.phoneCountry = $('#phone-country').value;
          const callingCode = state.geography.countries.find(country => country.code === state.phoneCountry).callingCode;
          state.mobile = `${callingCode}${value}`;
          response = await api('/otp/send', { method: 'POST', body: JSON.stringify({ mobile: state.mobile }) });
        }
        state.prototypeOtp = response.prototypeOtp;
        renderOtp();
        } catch (error) {
          toast(error.message);
      }
    };
  };
  $('#mode-mobile').onclick = () => renderForm('mobile');
  $('#mode-mrn').onclick = () => renderForm('mrn');
  $('#btn-back').onclick = renderHome;
  renderForm('mobile');
}

function renderOtp() {
  setHomeButton(true);
  const recipient = state.identityMode === 'mrn' ? 'registered mobile' : escapeHtml(state.mobile);
  main().innerHTML = `
    <section class="screen">
      <h1 class="screen-title">${t('verify')}</h1>
      <p class="screen-subtitle">Code sent to ${recipient}</p>
      <div class="card">
        <div class="prototype-banner">Prototype verification code: <strong>${escapeHtml(state.prototypeOtp)}</strong></div>
        <div class="form-group"><label>${t('otp')}</label><input id="otp" class="form-control otp-input" inputmode="numeric" maxlength="6" /></div>
        <button class="btn btn-primary" id="btn-verify">${t('verify')}</button>
        <button class="btn btn-outline" id="btn-back">${t('back')}</button>
      </div>
    </section>`;
  $('#btn-back').onclick = renderIdentity;
  $('#btn-verify').onclick = async () => {
    const otp = $('#otp').value.trim();
    try {
      const result = state.identityMode === 'mrn'
        ? await api('/identity/mrn/verify', { method: 'POST', body: JSON.stringify({ mrn: state.mrn, otp }) })
        : await api('/otp/verify', { method: 'POST', body: JSON.stringify({ mobile: state.mobile, otp }) });
      state.sessionId = result.sessionId;
      state.patient = result.patient;
      state.isNewPatient = !result.isExistingPatient;
      if (result.isExistingPatient) renderExistingPatient();
      else renderNewPatientForm();
    } catch (error) {
      toast(error.message);
    }
  };
}

function renderExistingPatient() {
  setHomeButton(true);
  const patient = state.patient;
  main().innerHTML = `
    <section class="screen">
      <h1 class="screen-title">${t('existingTitle')}</h1>
      <p class="screen-subtitle">${t('existingMessage')}</p>
      <div class="patient-card">
        <div class="name">${escapeHtml(patient.firstName)} ${escapeHtml(patient.lastName)}</div>
        <div class="meta">${t('mrnLabel')}: ${escapeHtml(patient.mrn)} • ${escapeHtml(patient.gender || '—')} • ${t('dob')}: ${escapeHtml(patient.dob || '—')}</div>
        <div class="meta">${t('mobile')}: ${escapeHtml(patient.mobile)}</div>
      </div>
      <div class="btn-group">
        <button class="btn btn-primary" id="btn-continue">${t('verifyDetails')}</button>
        <button class="btn btn-outline" id="btn-back">${t('back')}</button>
      </div>
    </section>`;
  $('#btn-continue').onclick = renderDateSelect;
  $('#btn-back').onclick = renderIdentity;
}

function field(id, label, type = 'text', required = false, value = '', extra = '') {
  return `<div class="form-group"><label for="${id}">${label}${required ? ' *' : ''}</label><input id="${id}" class="form-control" type="${type}" value="${escapeHtml(value)}" ${required ? 'required' : ''} ${extra}></div>`;
}

function renderNewPatientForm() {
  setHomeButton(true);
  main().innerHTML = `
    <section class="screen">
      <h1 class="screen-title">${t('newPatient')}</h1>
      <p class="screen-subtitle">${t('verifyDetails')}</p>
      <div class="card">
        <div class="form-row">
          ${field('firstName', t('firstName'), 'text', true)}
          ${field('lastName', t('lastName'), 'text', true)}
        </div>
        <div class="form-row">
          ${field('dob', t('dob'), 'date', true)}
          <div class="form-group"><label>${t('gender')} *</label><select id="gender" class="form-control" required>
            <option value="">${t('select')}</option><option>Male</option><option>Female</option><option>Other</option>
          </select></div>
        </div>
        ${field('mobile', t('mobile'), 'tel', true, state.mobile, 'readonly')}
        ${field('alternateMobile', t('alternateMobile'))}
        ${field('email', t('email'), 'email')}
        ${field('address', t('address'), 'text', true)}
        <div class="form-group"><label for="country">${t('country')} *</label><select id="country" class="form-control" required>
          <option value="">${t('select')}</option>${state.geography.countries.map(country => `<option value="${escapeHtml(country.name)}" ${country.name === (state.config?.country || 'India') ? 'selected' : ''}>${escapeHtml(country.name)}</option>`).join('')}
        </select></div>
        <div class="form-row">
          <div class="form-group"><label for="state">${t('state')} *</label><select id="state" class="form-control"></select><input id="state-other" class="form-control" aria-label="${t('enterState')}" placeholder="${t('enterState')}" hidden></div>
          <div class="form-group"><label for="district">${t('district')} *</label><select id="district" class="form-control"></select><input id="district-other" class="form-control" aria-label="${t('enterDistrict')}" placeholder="${t('enterDistrict')}" hidden></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label for="postOffice" id="post-office-label"></label><input id="postOffice" class="form-control" type="text"></div>
          <div class="form-group"><label for="pincode" id="pincode-label"></label><input id="pincode" class="form-control" type="text" aria-describedby="pincode-error"><p id="pincode-error" class="field-error" role="alert" hidden></p></div>
        </div>
        <div class="form-group"><label for="registration-type">${t('registrationType')} *</label><select id="registration-type" class="form-control" required>
          <option value="">${t('select')}</option><option value="OP">OP</option><option value="IP">IP</option><option value="ER">ER</option>
        </select><p class="settings-help">${t('typeNotice')}</p></div>
        <div class="form-group"><label>${t('bloodGroup')}</label><select id="bloodGroup" class="form-control">
          <option value="">${t('select')}</option><option>A+</option><option>A-</option><option>B+</option><option>B-</option>
          <option>O+</option><option>O-</option><option>AB+</option><option>AB-</option>
        </select></div>
        <div class="btn-group">
          <button class="btn btn-primary" id="btn-register">${t('register')}</button>
          <button class="btn btn-outline" id="btn-back">${t('back')}</button>
        </div>
      </div>
    </section>`;
  $('#btn-back').onclick = renderIdentity;
  const other = '__other__';
  const option = (value, label) => `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`;
  const updateDistrict = () => {
    const india = $('#country').value === 'India';
    const selectedState = state.geography.indiaStates.find(item => item.name === $('#state').value);
    const district = $('#district');
    district.innerHTML = option('', t('select')) + (selectedState ? selectedState.districts.map(name => option(name, name)).join('') : '') + option(other, t('otherLocation'));
    district.hidden = !india || $('#state').value === other;
    $('#district-other').hidden = !district.hidden;
    district.value = district.hidden ? other : '';
  };
  const updateState = () => {
    const india = $('#country').value === 'India';
    const select = $('#state');
    select.innerHTML = option('', t('select')) + state.geography.indiaStates.map(item => option(item.name, item.name)).join('') + option(other, t('otherLocation'));
    select.hidden = !india;
    select.value = india ? '' : other;
    $('#state-other').hidden = india;
    $('#state-other').value = '';
    $('#district-other').value = '';
    $('#pincode-label').textContent = india ? `${t('pin')} *` : t('postalCode');
    $('#post-office-label').textContent = india ? `${t('postOffice')} *` : t('postOffice');
    $('#pincode').maxLength = india ? 6 : 20;
    $('#pincode').inputMode = india ? 'numeric' : 'text';
    $('#pincode').value = '';
    $('#postOffice').required = india;
    $('#pincode-error').hidden = true;
    $('#pincode').removeAttribute('aria-invalid');
    updateDistrict();
  };
  $('#country').onchange = updateState;
  $('#state').onchange = () => {
    $('#state-other').hidden = $('#state').value !== other;
    $('#state-other').value = '';
    $('#district-other').value = '';
    updateDistrict();
  };
  $('#district').onchange = () => { $('#district-other').hidden = $('#district').value !== other; };
  $('#pincode').oninput = () => {
    $('#pincode-error').hidden = true;
    $('#pincode').removeAttribute('aria-invalid');
  };
  updateState();
  $('#btn-register').onclick = async () => {
    const payload = {
      sessionId: state.sessionId,
      firstName: $('#firstName').value.trim(),
      lastName: $('#lastName').value.trim(),
      dob: $('#dob').value,
      gender: $('#gender').value,
      alternateMobile: $('#alternateMobile').value.trim(),
      email: $('#email').value.trim(),
      address: $('#address').value.trim(),
      postOffice: $('#postOffice').value.trim(),
      pincode: $('#pincode').value.trim(),
      district: ($('#district').value === other ? $('#district-other').value : $('#district').value).trim(),
      state: ($('#state').value === other ? $('#state-other').value : $('#state').value).trim(),
      country: $('#country').value.trim(),
      registrationType: $('#registration-type').value,
      bloodGroup: $('#bloodGroup').value
    };
    if (payload.country === 'India' && !/^\d{6}$/.test(payload.pincode)) {
      $('#pincode-error').textContent = t('pinError');
      $('#pincode-error').hidden = false;
      $('#pincode').setAttribute('aria-invalid', 'true');
      $('#pincode').focus();
      return;
    }
    if (!$('#firstName').value || !$('#lastName').value || !payload.dob || !payload.gender ||
        !payload.address || (payload.country === 'India' && !payload.postOffice) || !payload.district || !payload.state || !payload.country || !payload.registrationType) {
      return toast(t('required'));
    }
    try {
      const response = await api('/patients', { method: 'POST', body: JSON.stringify(payload) });
      state.patient = response.patient;
      state.isNewPatient = true;
      renderDateSelect();
    } catch (error) {
      toast(error.message);
    }
  };
}

function formatDate(date) {
  return new Date(`${date}T12:00:00`).toLocaleDateString(state.lang === 'en' ? 'en-IN' : `${state.lang}-IN`, {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric'
  });
}

async function renderDateSelect() {
  setHomeButton(true);
  main().innerHTML = `<section class="screen"><h1 class="screen-title">${t('chooseDate')}</h1><p class="screen-subtitle">${t('availableDates')}</p><div id="dates" class="option-grid"><div class="spinner"></div></div><button class="btn btn-outline" id="btn-back">${t('back')}</button></section>`;
  $('#btn-back').onclick = state.isNewPatient ? renderNewPatientForm : renderExistingPatient;
  try {
    const response = await api('/dates');
    const container = $('#dates');
    if (!container) return;
    container.innerHTML = '';
    response.data.forEach(date => {
      const button = document.createElement('button');
      button.className = 'option-card';
      button.textContent = formatDate(date);
      button.onclick = () => { state.appointmentDate = date; renderDoctorSelect(); };
      container.appendChild(button);
    });
    if (!response.data.length) container.textContent = t('noSlots');
  } catch (error) {
    toast(error.message);
  }
}

async function renderDoctorSelect() {
  setHomeButton(true);
  main().innerHTML = `
    <section class="screen">
      <h1 class="screen-title">${t('chooseDoctor')}</h1>
      <p class="screen-subtitle">${formatDate(state.appointmentDate)}</p>
      <div id="followup-note"></div>
      <div class="form-row">
        <div class="form-group"><label>${t('department')}</label><select id="department" class="form-control"><option value="">${t('allDepartments')}</option></select></div>
        <div class="form-group"><label>${t('searchDoctor')}</label><input id="doctor-search" class="form-control" type="search" /></div>
      </div>
      <div id="doctor-list" class="option-grid"></div>
      <button class="btn btn-outline" id="btn-back">${t('back')}</button>
    </section>`;
  $('#btn-back').onclick = renderDateSelect;
  try {
    const response = await api('/doctors');
    state.doctors = response.data || [];
    state.departments = response.departments || [];
    const departments = $('#department');
    state.departments.forEach(department => {
      const option = document.createElement('option');
      option.value = department.id;
      option.textContent = department.name;
      departments.appendChild(option);
    });
    let previousDoctorId = null;
    if (state.visitIntent === 'followup') {
      const context = await api(`/visit-context?sessionId=${encodeURIComponent(state.sessionId)}&date=${encodeURIComponent(state.appointmentDate)}`);
      previousDoctorId = context.data.doctor?.id || null;
      const note = $('#followup-note');
      if (!context.data.doctor) {
        note.innerHTML = `<div class="prototype-banner">${t('noHistory')}</div>`;
      } else {
        const category = context.data.classification?.category;
        const noteText = category === 'Review'
          ? `${t('reviewExpires')} ${formatDate(context.data.classification.expiresOn)}`
          : t('reviewNotEligible');
        note.innerHTML = `<div class="patient-card"><strong>${t('previousDoctor')}:</strong> ${escapeHtml(context.data.doctor.name)}<div class="meta">${escapeHtml(noteText)}</div></div><button class="btn btn-primary" id="btn-previous-doctor">${t('continue')} • ${escapeHtml(context.data.doctor.name)}</button>`;
        $('#btn-previous-doctor').onclick = () => {
          state.doctor = context.data.doctor;
          renderSlotSelect();
        };
      }
    }
    const renderList = () => {
      const departmentId = departments.value;
      const query = $('#doctor-search').value.trim().toLowerCase();
      const filtered = state.doctors.filter(doctor =>
        (!departmentId || doctor.department === departmentId) &&
        (!query || doctor.name.toLowerCase().includes(query))
      );
      const list = $('#doctor-list');
      list.innerHTML = '';
      filtered.forEach(doctor => {
        const department = state.departments.find(item => item.id === doctor.department);
        const button = document.createElement('button');
        button.className = 'option-card';
        button.innerHTML = `<div class="doctor-card"><strong>${escapeHtml(doctor.name)}</strong><span>${escapeHtml(department?.name || doctor.department)} • ${currency(doctor.fee)}</span>${doctor.id === previousDoctorId ? `<span class="badge badge-success">${t('previousDoctor')}</span>` : ''}</div>`;
        button.onclick = () => { state.doctor = doctor; renderSlotSelect(); };
        list.appendChild(button);
      });
    };
    departments.onchange = renderList;
    $('#doctor-search').oninput = renderList;
    renderList();
  } catch (error) {
    toast(error.message);
  }
}

async function renderSlotSelect() {
  setHomeButton(true);
  main().innerHTML = `
    <section class="screen">
      <h1 class="screen-title">${t('chooseSlot')}</h1>
      <p class="screen-subtitle">${escapeHtml(state.doctor.name)} • ${formatDate(state.appointmentDate)} • ${currency(state.doctor.fee)}</p>
      <div id="suggestions"></div>
      <div class="card"><div id="slots" class="slot-grid"><div class="spinner"></div></div>
        <div class="btn-group"><button class="btn btn-primary" id="btn-continue" disabled>${t('continue')}</button><button class="btn btn-outline" id="btn-back">${t('back')}</button></div>
      </div>
    </section>`;
  $('#btn-back').onclick = renderDoctorSelect;
  $('#btn-continue').onclick = renderInvoice;
  try {
    const result = await api(`/slots?doctorId=${encodeURIComponent(state.doctor.id)}&date=${encodeURIComponent(state.appointmentDate)}`);
    const container = $('#slots');
    if (!container) return;
    container.innerHTML = '';
    result.data.forEach(slot => {
      const button = document.createElement('button');
      button.className = 'slot-btn';
      button.textContent = slot.display;
      button.onclick = () => {
        document.querySelectorAll('.slot-btn').forEach(item => item.classList.remove('selected'));
        button.classList.add('selected');
        state.slot = slot;
        $('#btn-continue').disabled = false;
      };
      container.appendChild(button);
    });
    if (!result.data.length) {
      container.innerHTML = `<p style="grid-column:1/-1;text-align:center;">${t('noSlots')}</p>`;
      if (result.suggestions?.length) {
        $('#suggestions').innerHTML = `<p>${t('suggestedDates')}</p><div class="btn-row">${result.suggestions.map(date => `<button class="btn btn-outline suggested-date" data-date="${date}">${formatDate(date)}</button>`).join('')}</div>`;
        document.querySelectorAll('.suggested-date').forEach(button => {
          button.onclick = () => { state.appointmentDate = button.dataset.date; renderSlotSelect(); };
        });
      }
    }
  } catch (error) {
    toast(error.message);
  }
}

async function renderInvoice() {
  if (!state.slot) return toast(t('required'));
  main().innerHTML = `<section class="screen"><div class="spinner"></div></section>`;
  try {
    const response = await api('/invoices', {
      method: 'POST',
      body: JSON.stringify({
        sessionId: state.sessionId,
        doctorId: state.doctor.id,
        slotId: state.slot.id,
        appointmentDate: state.appointmentDate,
        visitIntent: state.visitIntent
      })
    });
    state.invoice = response.invoice;
    renderInvoicePreview();
  } catch (error) {
    toast(error.message);
    renderSlotSelect();
  }
}

function renderInvoicePreview() {
  setHomeButton(true);
  const invoice = state.invoice;
  const paymentMethods = state.config.paymentConfig?.enabledMethods || ['upi', 'card', 'netBanking', 'cash'];
  const methodOptions = [
    ['upi', 'upi', t('upi')],
    ['card', 'card', t('card')],
    ['netBanking', 'net_banking', t('netBanking')],
    ['cash', 'cash_counter', t('cash')]
  ].filter(([configuredMethod]) => paymentMethods.includes(configuredMethod) &&
    (configuredMethod !== 'cash' || state.config.paymentConfig?.counterConfirmationEnabled !== false));
  const rows = [
    [t('visitCategory'), invoice.visitCategory],
    [t('appointment'), `${formatDate(invoice.appointmentDate)} • ${invoice.appointmentTime}`],
    ...invoice.lineItems.map(item => [item.description, currency(item.amount)]),
    ...(invoice.tax > 0 ? [[`Tax (${invoice.taxPercent}%)`, currency(invoice.tax)]] : []),
    [t('total'), currency(invoice.total)]
  ];
  main().innerHTML = `
    <section class="screen">
      <h1 class="screen-title">${t('invoice')}</h1>
      <p class="screen-subtitle">${escapeHtml(invoice.invoiceNumber)}</p>
      <div class="card">
        <div class="patient-card"><div class="name">${escapeHtml(invoice.patientName)}</div>
          <div class="meta">${t('mrnLabel')}: ${escapeHtml(invoice.patientMrn)} • ${escapeHtml(invoice.mobile)}</div>
          <div class="meta">${escapeHtml(invoice.doctorName)} • ${escapeHtml(state.departments.find(item => item.id === invoice.department)?.name || invoice.department)}</div>
        </div>
        <div class="invoice-box">${rows.map(([label, value], index) => `<div class="invoice-row"><span>${escapeHtml(label)}</span><span>${escapeHtml(value)}</span></div>`).join('')}</div>
        ${methodOptions.length ? `<div class="form-group"><label>${t('paymentMethod')}</label><select id="payment-method" class="form-control">
          ${methodOptions.map(([, value, label]) => `<option value="${value}">${escapeHtml(label)}</option>`).join('')}
        </select></div><button class="btn btn-primary" id="btn-pay">${t('pay')}</button>` : '<div class="error-box">No payment methods are currently enabled. Please contact the authorised counter.</div>'}
        <button class="btn btn-outline" id="btn-back">${t('back')}</button>
      </div>
    </section>`;
  if ($('#btn-pay')) $('#btn-pay').onclick = initiatePayment;
  $('#btn-back').onclick = renderSlotSelect;
}

async function initiatePayment() {
  try {
    const response = await api('/payments/initiate', {
      method: 'POST',
      body: JSON.stringify({
        sessionId: state.sessionId,
        invoiceId: state.invoice.id,
        paymentMethod: $('#payment-method').value
      })
    });
    state.payment = response.payment;
    renderPayment();
  } catch (error) {
    toast(error.message);
  }
}

function renderPayment() {
  setHomeButton(true);
  const isCash = $('#payment-method')?.value === 'cash_counter' || state.payment?.method === 'cash_counter';
  const canConfirmCounterPayment = state.staff?.permissions?.includes('payment:collect');
  let counterAuthorization = null;
  main().innerHTML = `
    <section class="screen">
      <h1 class="screen-title">${t('paymentMethod')}</h1>
      <p class="screen-subtitle">Prototype payment simulator • ${currency(state.payment.amount)}</p>
      <div class="card">
        ${isCash && !canConfirmCounterPayment ? `<p class="settings-help">Staff with payment collection permission must authorize this counter payment.</p>
        ${state.localLoginAvailable ? `<form id="counter-login-form" class="counter-login-form">
          <div class="form-group"><label for="counter-username">Staff username</label><input id="counter-username" class="form-control" autocomplete="username" required></div>
          <div class="form-group"><label for="counter-password">Staff password</label><input id="counter-password" class="form-control" type="password" autocomplete="current-password" required></div>
          <div id="counter-login-error" class="error-box" role="alert" hidden></div>
          <button type="submit" class="btn btn-outline" id="btn-counter-login">Authorize payment</button>
          <p class="settings-help">Authorization applies only to this payment and expires after 5 minutes.</p>
        </form>` : ''}
        ${state.oidcConfigured ? '<div class="btn-row"><button class="btn btn-outline" id="btn-counter-signin">Staff sign in in a new tab</button><button class="btn btn-outline" id="btn-check-counter-access">Check staff access</button></div>' : ''}
        ${!state.localLoginAvailable && !state.oidcConfigured ? '<div class="error-box">Staff sign-in is unavailable. Contact your administrator.</div>' : ''}
        <p id="counter-login-status" class="settings-help" aria-live="polite"></p>` : ''}
        <div class="btn-group">
        <button class="btn btn-success" id="btn-success" ${isCash && !canConfirmCounterPayment ? 'disabled' : ''}>${isCash ? t('counterConfirm') : t('successful')}</button>
        <button class="btn btn-danger" id="btn-failed">${t('failed')}</button>
        <button class="btn btn-outline" id="btn-cancel">${t('back')}</button>
      </div></div>
    </section>`;
  const finish = async outcome => {
    try {
      const response = await api('/payments/confirm', {
        method: 'POST',
        body: JSON.stringify({ sessionId: state.sessionId, paymentId: state.payment.id, outcome, counterAuthorization })
      });
      state.invoice = response.invoice || state.invoice;
      state.payment = response.payment;
      state.token = response.token;
      if (outcome === 'success') renderConfirmation();
      else {
        toast(response.message);
        renderInvoicePreview();
      }
    } catch (error) {
      if (outcome === 'success' && counterAuthorization) {
        counterAuthorization = null;
        const form = $('#counter-login-form');
        if (form) {
          form.hidden = false;
          $('#counter-login-status').textContent = 'Authorization is no longer available. Please authorize again.';
          $('#btn-success').disabled = true;
        }
      }
      toast(error.message);
    }
  };
  $('#btn-success').onclick = () => finish('success');
  $('#btn-failed').onclick = () => finish('failed');
  $('#btn-cancel').onclick = () => finish('cancelled');
  $('#counter-login-form')?.addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('button[type="submit"]');
    const errorBox = $('#counter-login-error');
    const password = $('#counter-password');
    button.disabled = true;
    errorBox.hidden = true;
    try {
      const response = await api('/payments/counter-authorize', {
        method: 'POST',
        body: JSON.stringify({
          sessionId: state.sessionId, paymentId: state.payment.id,
          username: $('#counter-username').value.trim(), password: password.value
        })
      });
      counterAuthorization = response.authorization;
      password.value = '';
      form.hidden = true;
      $('#counter-login-status').textContent = `Authorized by ${response.name}. Confirm within 5 minutes.`;
      $('#btn-success').disabled = false;
    } catch (error) {
      password.value = '';
      errorBox.textContent = error.message;
      errorBox.hidden = false;
    } finally {
      button.disabled = false;
    }
  });
  if ($('#btn-counter-signin')) {
    $('#btn-counter-signin').onclick = () => window.open('/api/auth/login', '_blank', 'noopener');
    $('#btn-check-counter-access').onclick = async () => {
      try {
        const response = await api('/auth/session');
        state.staff = response.staff;
        if (state.staff?.permissions?.includes('payment:collect')) renderPayment();
        else toast('Sign in with an authorised Front Office role first.');
      } catch (error) {
        toast(error.message);
      }
    };
  }
}

function renderConfirmation() {
  setHomeButton(true);
  const invoice = state.invoice;
  main().innerHTML = `
    <section class="screen">
      <div class="success-icon">✓</div><h1 class="screen-title">${t('receipt')}</h1>
      <p class="screen-subtitle">${escapeHtml(invoice.visitCategory)} • ${escapeHtml(invoice.doctorName)}</p>
      <div class="token-box"><div class="token-label">${t('token')}</div><div class="token-number">${escapeHtml(state.token.tokenNumber)}</div></div>
      <div class="card">
        <div class="invoice-row"><span>${t('mrnLabel')}</span><span>${escapeHtml(invoice.patientMrn)}</span></div>
        <div class="invoice-row"><span>${t('appointment')}</span><span>${formatDate(invoice.appointmentDate)}</span></div>
        <div class="invoice-row"><span>${t('scheduledTime')}</span><span>${escapeHtml(invoice.appointmentTime)}</span></div>
        <div class="invoice-row"><span>${t('paymentStatus')}</span><span>${state.payment.method === 'cash_counter' ? t('counter') : t('paid')}</span></div>
        <div class="invoice-row"><span>${t('invoice')}</span><span>${escapeHtml(invoice.invoiceNumber)} • ${currency(invoice.total)}</span></div>
      </div>
      <button class="btn btn-primary" id="btn-done">${t('startOver')}</button>
    </section>`;
  $('#btn-done').onclick = resetAndWelcome;
}

async function renderReport() {
  if (!state.staff) return renderStaffLogin('reports');
  if (!state.staff.canViewDailyReport) return renderAdminPortal();
  setAdminLayout(true);
  $('#app').classList.remove('bi-mode');
  setHomeButton(false);
  const today = new Date();
  const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  main().innerHTML = `
    <section class="screen">
      <h1 class="screen-title">${t('reports')}</h1>
      <div class="card"><div class="form-group"><label>${t('date')}</label><input id="report-date" type="date" class="form-control" value="${date}"></div>
      <button class="btn btn-primary" id="btn-load-report">${t('loadReport')}</button></div>
      <div id="report-results"></div><button class="btn btn-outline" id="btn-back">${t('back')}</button>
    </section>`;
  attachAdminNavigation('reports');
  $('#btn-back').onclick = () => navigateStaffPage('admin');
  $('#btn-load-report').onclick = loadReport;
  await loadReport();
}

async function loadReport() {
  try {
    const date = $('#report-date').value;
    const result = await api(`/reports/daily?date=${encodeURIComponent(date)}`);
    const report = result.data;
    const metrics = [
      [t('registrations'), report.registrations], [t('patients'), report.uniquePatients],
      [t('bookings'), report.appointments], [t('newConsultations'), report.newConsultations],
      [t('reviews'), report.reviews], [t('revisits'), report.revisits],
      [t('invoiced'), currency(report.invoicedAmount)], [t('collected'), currency(report.paidAmount)]
    ];
    const appointmentRows = (report.appointmentRows || []).map(appointment => {
      const canComplete = appointment.canComplete;
      const action = canComplete
        ? `<div class="visit-time-fields"><label>Arrival <input type="time" class="arrival-time form-control"></label><label>Consult start <input type="time" class="consultation-start-time form-control"></label><button class="btn btn-outline complete-appointment" data-id="${escapeHtml(appointment.id)}">${t('markComplete')}</button></div>`
        : escapeHtml(appointment.status === 'completed' ? t('completed') : appointment.status);
      return `<tr><td>${escapeHtml(appointment.appointmentTime)}</td><td>${escapeHtml(appointment.patientName)}</td><td>${escapeHtml(appointment.doctorName)}</td><td>${escapeHtml(appointment.visitCategory)}</td><td>${action}</td></tr>`;
    }).join('');
    $('#report-results').innerHTML = `<div class="report-grid">${metrics.map(([label, value]) => `<div class="card report-card"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join('')}</div>
      <div class="card"><h2>${t('departmentBreakdown')}</h2>${Object.entries(report.departmentCounts).map(([department, count]) => `<div class="invoice-row"><span>${escapeHtml(state.departments.find(item => item.id === department)?.name || department)}</span><strong>${count}</strong></div>`).join('') || '<p>—</p>'}</div>
      <div class="card"><h2>${t('appointments')}</h2><div class="table-wrap"><table class="report-table"><thead><tr><th>${t('scheduledTime')}</th><th>${t('patients')}</th><th>${t('doctor')}</th><th>${t('visitCategory')}</th><th></th></tr></thead><tbody>${appointmentRows || '<tr><td colspan="5">—</td></tr>'}</tbody></table></div></div>`;
    document.querySelectorAll('.complete-appointment').forEach(button => {
      button.onclick = async () => {
        try {
          const row = button.closest('tr');
          await api(`/appointments/${encodeURIComponent(button.dataset.id)}/complete`, {
            method: 'POST',
            body: JSON.stringify({
              arrivalTime: row.querySelector('.arrival-time').value,
              consultationStartTime: row.querySelector('.consultation-start-time').value
            })
          });
          await loadReport();
        } catch (error) {
          toast(error.message);
        }
      };
    });
  } catch (error) {
    toast(`${t('reportError')} ${error.message}`);
  }
}

function dateInHospitalZone() {
  const timeZone = state.config?.timeZone || 'Asia/Kolkata';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function shiftDate(dateValue, dayOffset) {
  const date = new Date(`${dateValue}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + dayOffset);
  return date.toISOString().slice(0, 10);
}

function periodRange(period, dateValue) {
  if (period === 'weekly') return [shiftDate(dateValue, -6), dateValue];
  if (period === 'monthly') return [`${dateValue.slice(0, 7)}-01`, dateValue];
  if (period === 'quarterly') {
    const month = Number(dateValue.slice(5, 7));
    const firstMonth = Math.floor((month - 1) / 3) * 3 + 1;
    return [`${dateValue.slice(0, 4)}-${String(firstMonth).padStart(2, '0')}-01`, dateValue];
  }
  if (period === 'annual') return [`${dateValue.slice(0, 4)}-01-01`, dateValue];
  return [dateValue, dateValue];
}

function renderAnalytics() {
  if (!state.staff) return renderStaffLogin('analytics');
  if (!state.staff.reportView) return renderAdminPortal();
  setAdminLayout(true);
  $('#app').classList.add('bi-mode');
  setHomeButton(false);
  const today = dateInHospitalZone();
  state.analyticsMode = 'live';
  state.analyticsReport = null;
  state.analyticsQuery = null;
  const reportView = state.staff?.reportView || 'operational';
  const departmentScoped = reportView === 'department';
  const demographicVisible = departmentScoped || reportView === 'strategic';
  const departments = (state.config.departments || []).filter(item =>
    !departmentScoped || state.staff.departmentIds.includes(item.id)
  );
  const doctors = (state.config.doctors || []).filter(item =>
    !departmentScoped || state.staff.departmentIds.includes(item.department)
  );
  const demographicFilters = demographicVisible ? `
        <div class="form-row">
          <div class="form-group"><label for="analytics-age">Age group (as of end date)</label><select class="form-control" id="analytics-age">
            <option value="">All ages</option><option value="0-5">0–5</option><option value="6-12">6–12</option>
            <option value="13-18">13–18</option><option value="19-30">19–30</option><option value="31-45">31–45</option>
            <option value="46-60">46–60</option><option value="61-75">61–75</option><option value="76+">Above 75</option><option value="Unknown">Unknown</option>
          </select></div>
          <div class="form-group"><label for="analytics-gender">Gender</label><select class="form-control" id="analytics-gender">
            <option value="">All</option><option>Male</option><option>Female</option><option>Other</option>
          </select></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label for="analytics-state">State</label><input class="form-control" id="analytics-state" type="search" placeholder="Optional exact match"></div>
          <div class="form-group"><label for="analytics-district">District</label><input class="form-control" id="analytics-district" type="search" placeholder="Optional exact match"></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label for="analytics-pincode">Postal / PIN code</label><input class="form-control" id="analytics-pincode" type="search" placeholder="Optional exact match"></div>
          <div class="form-group"><label for="analytics-country">Country</label><input class="form-control" id="analytics-country" type="search" placeholder="Optional exact match"></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label for="analytics-post-office">Post office</label><input class="form-control" id="analytics-post-office" type="search" placeholder="Optional exact match"></div>
          <div class="form-group"><label for="analytics-locality">Locality</label><input class="form-control" id="analytics-locality" type="search" placeholder="Optional exact match"></div>
        </div>` : '';
  main().innerHTML = `
    <section class="screen analytics-screen">
      <h1 class="screen-title">Registration &amp; Business Intelligence</h1>
      <p class="screen-subtitle">${reportView === 'finance' ? 'Finance: revenue, collections, payment modes, and refunds' : reportView === 'hospital' ? 'Hospital operations: footfall, appointments, capacity, and patient flow' : departmentScoped ? 'Assigned departments: operational and demographic performance' : 'Strategic operational, demographic, revenue, capacity, and patient-flow summaries'}</p>
      <div class="prototype-banner">Role-authorized aggregate report for ${escapeHtml(state.staff.name)}. Data is limited to ${departmentScoped ? 'your assigned departments' : `the configured hospital (${escapeHtml(state.config.hospitalCode)})`}. Transaction drill-down is not available.</div>
      <div class="rd-mode-switch" aria-label="Report data source">
        <button type="button" class="active" id="btn-live-report" aria-pressed="true">Live prototype report</button>
        <button type="button" id="btn-demo-report" aria-pressed="false">Preview with demo data</button>
        <button type="button" class="rd-demo-print" id="btn-demo-print" hidden>Print demo preview</button>
      </div>
      <form class="card analytics-filters" id="analytics-filters">
        <div class="form-row">
          <div class="form-group"><label for="analytics-hospital">Hospital</label><select class="form-control" id="analytics-hospital" disabled>
            <option>${escapeHtml(state.config.hospitalName)} (${escapeHtml(state.config.hospitalCode)})</option>
          </select><small class="settings-help">Multi-hospital selection requires tenant-separated transaction data.</small></div>
          <div class="form-group"><label for="analytics-period">Reporting period</label><select class="form-control" id="analytics-period">
            <option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option>
            <option value="quarterly">Quarterly</option><option value="annual">Annual</option><option value="custom">Custom date range</option>
          </select></div>
          <div class="form-group"><label for="analytics-department">Department</label><select class="form-control" id="analytics-department">
            <option value="">All ${departmentScoped ? 'assigned departments' : 'departments'}</option>${departments.map(item => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`).join('')}
          </select></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label for="analytics-start">Start date</label><input class="form-control" id="analytics-start" type="date" value="${today}" required></div>
          <div class="form-group"><label for="analytics-end">End date</label><input class="form-control" id="analytics-end" type="date" value="${today}" required></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label for="analytics-doctor">Doctor</label><select class="form-control" id="analytics-doctor">
            <option value="">All doctors</option>${doctors.map(item => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`).join('')}
          </select></div>
        </div>
        ${demographicFilters}
        <div class="btn-row">
          <button class="btn btn-primary" id="btn-load-analytics" type="submit">Run report</button>
          <button class="btn btn-outline btn-compact" id="btn-export-analytics" type="button" disabled>Download Excel (.xlsx)</button>
          <button class="btn btn-outline btn-compact" id="btn-export-csv" type="button" disabled>Download CSV</button>
          <button class="btn btn-outline btn-compact" id="btn-print-analytics" type="button" disabled>Print / Save PDF</button>
        </div>
      </form>
      <div id="analytics-error" class="error-box" hidden></div>
      ${reportView === 'strategic' ? `<section class="card scheduled-report-panel">
        <h2>Scheduled report exports</h2>
        <p>Configured reports are generated as Excel files for the previous completed period, using hospital-local time. No email delivery is configured.</p>
        <div id="scheduled-report-list" aria-live="polite">Loading scheduled reports…</div>
      </section>` : ''}
      <div id="analytics-results" aria-live="polite"></div>
      <button class="btn btn-outline" id="btn-bi-back">${t('back')}</button>
    </section>`;

  attachAdminNavigation('analytics');
  const periodControl = $('#analytics-period');
  const setDatesForPeriod = () => {
    if (periodControl.value === 'custom') return;
    const [startDate, endDate] = periodRange(periodControl.value, dateInHospitalZone());
    $('#analytics-start').value = startDate;
    $('#analytics-end').value = endDate;
  };
  periodControl.onchange = setDatesForPeriod;
  $('#analytics-department').onchange = () => {
    const departmentId = $('#analytics-department').value;
    [...$('#analytics-doctor').options].forEach(option => {
      if (!option.value) return;
      const doctor = state.config.doctors.find(item => item.id === option.value);
      option.hidden = !!departmentId && doctor?.department !== departmentId;
    });
    if ($('#analytics-doctor').selectedOptions[0]?.hidden) $('#analytics-doctor').value = '';
  };
  $('#analytics-filters').onsubmit = event => {
    event.preventDefault();
    loadAnalytics();
  };
  $('#btn-export-analytics').onclick = exportAnalyticsExcel;
  $('#btn-export-csv').onclick = exportAnalyticsCsv;
  $('#btn-print-analytics').onclick = () => window.print();
  $('#btn-demo-print').onclick = () => window.print();
  $('#btn-live-report').onclick = () => setAnalyticsMode('live');
  $('#btn-demo-report').onclick = () => setAnalyticsMode('demo');
  $('#btn-bi-back').onclick = () => navigateStaffPage('admin');
  loadAnalytics();
  if (reportView === 'strategic') loadScheduledReports();
}

function formatAverage(value, suffix = 'min') {
  return value === null || value === undefined ? '—' : `${value} ${suffix}`;
}

function renderAnalyticsBars(title, rows, valueKey = 'value', format = value => String(value), limit = 10) {
  const values = rows.slice(0, limit);
  if (!values.length) return `<div class="card bi-chart"><h2>${escapeHtml(title)}</h2><p>No data in the selected range.</p></div>`;
  const maximum = Math.max(1, ...values.map(item => Number(item[valueKey]) || 0));
  return `<div class="card bi-chart"><h2>${escapeHtml(title)}</h2><div class="bi-bars">${values.map(item => {
    const value = Number(item[valueKey]) || 0;
    const width = Math.max(value > 0 ? 2 : 0, Math.round((value / maximum) * 100));
    return `<div class="bi-bar-row"><span class="bi-bar-label" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</span><div class="bi-bar-track"><span style="width:${width}%"></span></div><strong>${escapeHtml(format(value, item))}</strong></div>`;
  }).join('')}</div></div>`;
}

function renderAnalyticsComparisons(rows) {
  const maximum = Math.max(1, ...rows.flatMap(item => [Number(item.current) || 0, Number(item.previous) || 0]));
  return `<div class="card bi-chart"><h2>Current vs previous period</h2>${rows.map(item => {
    const currentWidth = Math.max(item.current > 0 ? 2 : 0, Math.round((item.current / maximum) * 100));
    const previousWidth = Math.max(item.previous > 0 ? 2 : 0, Math.round((item.previous / maximum) * 100));
    const growth = item.growthPercent === null ? 'No prior baseline' : `${item.growthPercent}%`;
    return `<div class="bi-comparison-row"><div class="bi-comparison-heading"><span>${escapeHtml(item.name)}</span><strong>${escapeHtml(growth)}</strong></div><div class="bi-comparison-bar"><span style="width:${currentWidth}%"></span></div><small>Current: ${escapeHtml(item.current)}</small><div class="bi-comparison-bar previous"><span style="width:${previousWidth}%"></span></div><small>Previous: ${escapeHtml(item.previous)}</small></div>`;
  }).join('')}<p class="bi-legend"><span>Current</span><span>Previous</span></p></div>`;
}

function renderAnalyticsTable(title, columns, rows, renderRow) {
  return `<div class="card">${title ? `<h2>${escapeHtml(title)}</h2>` : ''}<div class="table-wrap"><table class="report-table bi-table"><thead><tr>${columns.map(column => `<th>${escapeHtml(column)}</th>`).join('')}</tr></thead><tbody>${rows.length ? rows.map(renderRow).join('') : `<tr><td colspan="${columns.length}">No data in the selected range.</td></tr>`}</tbody></table></div></div>`;
}

function bindRegistrationOverview(report) {
  const selector = $('#registration-trend-interval');
  if (!selector) return;
  selector.onchange = () => {
    const rows = report.registrationAnalytics.trends[selector.value];
    $('#registration-trend-chart').innerHTML = registrationTrendChart(rows);
  };
}

function renderScopedAnalyticsResults(report) {
  const summary = report.summary;
  const finance = report.view === 'finance';
  const metrics = finance
    ? [
      ['Amount invoiced', currency(summary.invoicedAmount)],
      ['Amount collected', currency(summary.collectedAmount)],
      ['Payment failures', summary.failedPayments],
      ['Refunds', currency(summary.refunds)],
      ['Average revenue / consultation', currency(summary.averageRevenuePerConsultation)],
      ['Estimated free-review value', currency(summary.freeReviewEstimatedValue)]
    ]
    : [
      ['OP footfall', summary.footfall], ['Registrations', summary.registrations],
      ['New patients', summary.newPatients], ['Returning patients', summary.existingPatients],
      ['Appointments', summary.appointments], ['Pending consultations', summary.pendingConsultations],
      ['New consultations', summary.newConsultations], ['Free reviews', summary.reviews],
      ['Chargeable revisits', summary.revisits], ['Cancelled', summary.cancelled],
      ['No-shows', summary.noShows], ['Tokens generated', summary.tokens],
      ['No-show rate', `${summary.noShowPercent}%`],
      ['Average registration time', formatAverage(summary.averageRegistrationMinutes)],
      ['Average patient wait', formatAverage(summary.averageWaitingMinutes)],
      ['Average appointment delay', formatAverage(summary.averageAppointmentDelayMinutes)],
      ['Average consultation duration', formatAverage(summary.averageConsultationMinutes)],
      ['Patient retention', `${summary.patientRetentionPercent}%`],
      ['Repeat consultations', summary.repeatConsultations]
    ];
  const charts = report.charts;
  const chartMarkup = finance ? `
    ${renderAnalyticsBars('Collections by payment method', charts.paymentMethods.map(item => ({ name: item.name, value: item.amount })), 'value', currency)}
    ${renderAnalyticsBars('Revenue by department', charts.departments.map(item => ({ name: item.name, value: item.collected })), 'value', currency)}
    ${renderAnalyticsBars('Revenue by doctor', charts.doctors.map(item => ({ name: item.name, value: item.collected })), 'value', currency)}
    ${renderAnalyticsBars('Revenue by visit category', charts.visitCategoryRevenue.map(item => ({ name: item.name, value: item.collected })), 'value', currency)}
    ${renderAnalyticsBars('Collections by period', charts.trends.map(item => ({ name: item.period, value: item.collected })), 'value', currency, 31)}` : `
    ${renderAnalyticsComparisons(charts.periodComparisons)}
    ${renderAnalyticsBars('OP footfall trend', charts.trends.map(item => ({ name: item.period, value: item.footfall })), 'value', value => String(value), 31)}
    ${renderAnalyticsBars('Registrations by period', charts.trends.map(item => ({ name: item.period, value: item.registrations })), 'value', value => String(value), 31)}
    ${renderAnalyticsBars('Appointments by period', charts.trends.map(item => ({ name: item.period, value: item.appointments })), 'value', value => String(value), 31)}
    ${renderAnalyticsBars('Visit category mix', charts.visitCategories, 'value', value => String(value))}
    ${renderAnalyticsBars('Department appointments', charts.departments.map(item => ({ name: item.name, value: item.appointments })), 'value', value => String(value))}
    ${renderAnalyticsBars('Doctor consultations', charts.doctors.map(item => ({ name: item.name, value: item.completed })), 'value', value => String(value))}
    ${renderAnalyticsBars('Hourly scheduled appointments', charts.hourlyScheduledAppointments, 'value', value => String(value), 24)}
    ${renderAnalyticsBars('Hourly patient arrivals', charts.hourlyActualArrivals, 'value', value => String(value), 24)}
    ${report.view === 'department' ? `
      ${renderAnalyticsBars('Age-wise patient distribution', charts.ageGroups, 'value', value => String(value), 9)}
      ${renderAnalyticsBars('New-patient age groups', charts.newAgeGroups, 'value', value => String(value), 9)}
      ${renderAnalyticsBars('Returning-patient age groups', charts.returningAgeGroups, 'value', value => String(value), 9)}
      ${renderAnalyticsBars('Gender distribution', charts.gender, 'value', value => String(value))}
      ${renderAnalyticsBars('District catchment', charts.districts, 'value', value => String(value))}
      ${renderAnalyticsBars('State distribution', charts.states, 'value', value => String(value))}
      ${renderAnalyticsTable('Age and gender cross-tabulation', ['Age group', 'Male', 'Female', 'Other', 'Unknown', 'Total'], charts.ageGroups, item => {
        const row = charts.ageGender[item.name] || {};
        return `<tr><td>${escapeHtml(item.name)}</td>${['Male', 'Female', 'Other', 'Unknown'].map(gender => `<td>${escapeHtml(row[gender] || 0)}</td>`).join('')}<td>${item.value}</td></tr>`;
      })}` : ''}`;

  $('#analytics-results').innerHTML = `
    <div class="analytics-range">Reporting ${escapeHtml(report.period.startDate)} to ${escapeHtml(report.period.endDate)} • ${escapeHtml(state.config.hospitalName)}</div>
    ${finance ? '<div class="prototype-banner">Registration fee collection and waivers are unavailable: the prototype does not reliably allocate payments or record fee waivers by charge.</div>' : renderRegistrationDashboard(report)}
    <div class="report-grid bi-summary">${metrics.map(([label, value]) => `<div class="card report-card"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value ?? '—')}</strong></div>`).join('')}</div>
    <div class="bi-grid">${chartMarkup}</div>`;
  if (!finance) bindRegistrationOverview(report);
}

function renderAnalyticsResults(report) {
  if (report.view) return renderScopedAnalyticsResults(report);
  const summary = report.summary;
  const metrics = [
    ['OP footfall', summary.footfall], ['Registrations', summary.registrations],
    ['New patients', summary.newPatients], ['Returning patients', summary.existingPatients],
    ['Appointments / bookings', summary.appointments], ['Pending consultations', summary.pendingConsultations],
    ['New consultations', summary.newConsultations], ['Free reviews', summary.reviews],
    ['Chargeable revisits', summary.revisits], ['Cancelled', summary.cancelled],
    ['No-shows', summary.noShows], ['Tokens generated', summary.tokens],
    ['Amount invoiced', currency(summary.invoicedAmount)], ['Amount collected', currency(summary.collectedAmount)],
    ['Payment failures', summary.failedPayments], ['Refunds', currency(summary.refunds)],
    ['Avg revenue / consultation', currency(summary.averageRevenuePerConsultation)],
    ['Estimated free-review value', currency(summary.freeReviewEstimatedValue)],
    ['No-show rate', `${summary.noShowPercent}%`],
    ['Avg registration flow', formatAverage(summary.averageRegistrationMinutes)],
    ['Avg patient wait', formatAverage(summary.averageWaitingMinutes)],
    ['Avg appointment delay', formatAverage(summary.averageAppointmentDelayMinutes)],
    ['Avg consultation duration', formatAverage(summary.averageConsultationMinutes)],
    ['Gross value of unused slots (estimate)', currency(summary.unutilizedSlotGrossValue)],
    ['Patient retention', `${summary.patientRetentionPercent}%`],
    ['Registration growth vs prior period', summary.registrationGrowthPercent === null ? 'No prior baseline' : `${summary.registrationGrowthPercent}%`],
    ['Footfall growth vs prior period', summary.footfallGrowthPercent === null ? 'No prior baseline' : `${summary.footfallGrowthPercent}%`],
    ['Collection growth vs prior period', summary.collectionGrowthPercent === null ? 'No prior baseline' : `${summary.collectionGrowthPercent}%`]
  ];
  const trendRows = report.charts.trends.map(item => ({ name: item.period, value: item.footfall }));
  const paymentRows = report.charts.paymentMethods.map(item => ({ ...item, value: item.amount }));
  const geoRevenueRows = report.charts.geographyRevenue.map(item => ({ ...item, name: item.name, value: item.value }));
  const genderKeys = ['Male', 'Female', 'Other', 'Unknown'];
  const ageGenderRows = report.charts.ageGroups.map(item => {
    const row = report.charts.ageGender[item.name] || {};
    return `<tr><td>${escapeHtml(item.name)}</td>${genderKeys.map(gender => `<td>${escapeHtml(row[gender] || 0)}</td>`).join('')}<td>${escapeHtml(item.value)}</td></tr>`;
  }).join('');
  const ageDepartmentRows = Object.entries(report.charts.ageDepartment).flatMap(([ageGroup, departments]) =>
    Object.entries(departments).map(([department, count]) => `<tr><td>${escapeHtml(ageGroup)}</td><td>${escapeHtml(state.config.departments.find(item => item.id === department)?.name || department)}</td><td>${count}</td></tr>`)
  ).join('');
  const currencyFormat = value => currency(value);
  const volumeFormat = value => String(value);
  const forecast = report.strategic.demandForecast;
  const funnel = report.strategic.conversionFunnel;
  const funnelRows = [
    { name: 'Identity started', value: funnel.stages.identityStarted },
    { name: 'Identity verified', value: funnel.stages.identityVerified },
    { name: 'New patients verified', value: funnel.stages.newPatientVerified },
    { name: 'New patients registered', value: funnel.stages.patientRegistered },
    { name: 'Eligible to book', value: funnel.stages.eligibleForBooking },
    { name: 'Appointment slots reserved', value: funnel.stages.appointmentSlotsReserved },
    { name: 'Payments started', value: funnel.stages.paymentsStarted },
    { name: 'Payments succeeded', value: funnel.stages.paymentsSucceeded }
  ];
  const dropOffRows = [
    { name: 'Identity verification', ...funnel.dropOff.identityVerification },
    { name: 'New-patient registration', ...funnel.dropOff.newPatientRegistration },
    { name: 'Appointment reservation', ...funnel.dropOff.appointmentReservation },
    { name: 'Payment completion', ...funnel.dropOff.paymentCompletion }
  ];

  $('#analytics-results').innerHTML = `
    <div class="analytics-range">Reporting ${escapeHtml(report.period.startDate)} to ${escapeHtml(report.period.endDate)} • ${escapeHtml(state.config.hospitalName)}</div>
    ${renderRegistrationDashboard(report)}
    <div class="report-grid bi-summary">${metrics.map(([label, value], index) => {
      const coverageByMetric = {
        19: report.coverage.registrationTimingRecords,
        20: report.coverage.arrivalRecords,
        21: report.coverage.consultationStartRecords,
        22: report.coverage.consultationDurationRecords
      };
      const count = coverageByMetric[index];
      return `<div class="card report-card"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong>${count !== undefined ? `<small>${count} records with timestamps</small>` : ''}</div>`;
    }).join('')}</div>
    <div class="bi-grid">
      ${renderAnalyticsComparisons(report.charts.periodComparisons)}
      ${renderAnalyticsBars('OP footfall trend', trendRows, 'value', volumeFormat, 31)}
      ${renderAnalyticsBars('Visit category mix', report.charts.visitCategories, 'value', volumeFormat)}
      ${renderAnalyticsBars('Age-wise patient distribution', report.charts.ageGroups, 'value', volumeFormat, 9)}
      ${renderAnalyticsBars('New-patient age groups', report.charts.newAgeGroups, 'value', volumeFormat, 9)}
      ${renderAnalyticsBars('Returning-patient age groups', report.charts.returningAgeGroups, 'value', volumeFormat, 9)}
      ${renderAnalyticsBars('Gender distribution', report.charts.gender, 'value', volumeFormat)}
      ${renderAnalyticsBars('Completed visits per patient', report.charts.visitFrequency, 'value', volumeFormat)}
      ${renderAnalyticsBars('District catchment', report.charts.districts, 'value', volumeFormat)}
      ${renderAnalyticsBars('Country distribution', report.charts.countries, 'value', volumeFormat)}
      ${renderAnalyticsBars('Postal / PIN code catchment', report.charts.pinCodes, 'value', volumeFormat)}
      ${renderAnalyticsBars('Post office catchment', report.charts.postOffices, 'value', volumeFormat)}
      ${renderAnalyticsBars('Locality distribution', report.charts.localities, 'value', volumeFormat)}
      ${renderAnalyticsBars('State distribution', report.charts.states, 'value', volumeFormat)}
      ${renderAnalyticsBars('New-patient acquisition by district', report.charts.newPatientDistricts, 'value', volumeFormat)}
      ${renderAnalyticsBars('Revenue by district', geoRevenueRows, 'value', currencyFormat)}
      ${renderAnalyticsBars('Payment mode collections', paymentRows, 'value', currencyFormat)}
      ${renderAnalyticsBars('Revenue by reporting period', report.charts.trends.map(item => ({ name: item.period, value: item.collected })), 'value', currencyFormat, 31)}
      ${renderAnalyticsBars('Hourly scheduled appointments', report.charts.hourlyScheduledAppointments, 'value', volumeFormat, 24)}
      ${renderAnalyticsBars('Hourly actual patient arrivals', report.charts.hourlyActualArrivals, 'value', volumeFormat, 24)}
      ${renderAnalyticsBars('Registrations by period', report.charts.trends.map(item => ({ name: item.period, value: item.registrations })), 'value', volumeFormat, 31)}
    </div>
    ${renderAnalyticsTable('Target vs actual (hospital-level)', ['Metric', 'Period', 'Target', 'Actual', 'Variance', 'Attainment %'], report.strategic.targetComparisons, item =>
      `<tr><td>${escapeHtml(item.metric)}</td><td>${escapeHtml(item.period)}</td><td>${item.target}</td><td>${item.actual}</td><td>${item.variance}</td><td>${item.attainmentPercent === null ? '—' : `${item.attainmentPercent}%`}</td></tr>`)}
    <p class="analytics-range">Configure targets in Administrative Settings under reportConfig.targets. Targets compare only with unfiltered hospital totals.</p>
    <div class="card">
      <h2>Age and gender cross-tabulation</h2>
      <div class="table-wrap"><table class="report-table bi-table"><thead><tr><th>Age group</th>${genderKeys.map(item => `<th>${item}</th>`).join('')}<th>Total</th></tr></thead><tbody>${ageGenderRows}</tbody></table></div>
    </div>
    ${renderAnalyticsTable('Department preference by age group', ['Age group', 'Department', 'Appointments'], report.charts.ageGroups.flatMap(group =>
      Object.entries(report.charts.ageDepartment[group.name] || {}).map(([department, count]) => ({ ageGroup: group.name, department, count }))
    ), item => `<tr><td>${escapeHtml(item.ageGroup)}</td><td>${escapeHtml(state.config.departments.find(department => department.id === item.department)?.name || item.department)}</td><td>${item.count}</td></tr>`)}
    ${renderAnalyticsTable('Department utilization by gender', ['Gender', 'Department', 'Appointments'], Object.entries(report.charts.genderDepartment).flatMap(([gender, departments]) =>
      Object.entries(departments).map(([department, count]) => ({ gender, department, count }))
    ), item => `<tr><td>${escapeHtml(item.gender)}</td><td>${escapeHtml(state.config.departments.find(department => department.id === item.department)?.name || item.department)}</td><td>${item.count}</td></tr>`)}
    ${renderAnalyticsTable('Department-wise patient geography', ['District', 'Department', 'Appointments'], Object.entries(report.charts.districtDepartment).flatMap(([district, departments]) =>
      Object.entries(departments).map(([department, count]) => ({ district, department, count }))
    ), item => `<tr><td>${escapeHtml(item.district)}</td><td>${escapeHtml(state.config.departments.find(department => department.id === item.department)?.name || item.department)}</td><td>${item.count}</td></tr>`)}
    ${renderAnalyticsTable('Age-group trends (age at registration)', ['Period', 'Age group', 'New registrations'], report.charts.ageTrends, item =>
      `<tr><td>${escapeHtml(item.period)}</td><td>${escapeHtml(item.name)}</td><td>${item.value}</td></tr>`)}
    ${renderAnalyticsTable('Gender registration trends', ['Period', 'Gender', 'New registrations'], report.charts.genderTrends, item =>
      `<tr><td>${escapeHtml(item.period)}</td><td>${escapeHtml(item.name)}</td><td>${item.value}</td></tr>`)}
    ${renderAnalyticsTable('Geographical patient growth', ['Period', 'District', 'New patients'], report.charts.geographyTrends, item =>
      `<tr><td>${escapeHtml(item.period)}</td><td>${escapeHtml(item.name)}</td><td>${item.value}</td></tr>`)}
    <section class="strategic-section">
      <h2>Strategic management and decision support</h2>
      <p class="strategic-caveat">Descriptive planning estimates only. No automated staffing or clinical recommendations are generated.</p>
      <div class="strategic-grid">
        <div class="card">
          <h3>Department demand and capacity outlook</h3>
          <p>Target month: ${escapeHtml(forecast.targetStartDate)} to ${escapeHtml(forecast.targetEndDate)}. Forecasts require completed visits in all six consecutive months before the report month.</p>
          ${renderAnalyticsTable('', ['Department', '6-month history', 'Projected visits', 'Scheduled capacity*', 'Demand − capacity', 'Additional sessions'], forecast.departments, item =>
            `<tr><td>${escapeHtml(item.name)}</td><td>${item.observedHistoryMonths}/${item.requiredHistoryMonths} months</td><td>${item.status === 'projected' ? item.forecastVisits : 'Insufficient data'}</td><td>${item.nextMonthCapacity}</td><td>${item.capacityGap === null ? '—' : item.capacityGap}</td><td>${item.status === 'projected' ? item.additionalSessions : '—'}</td></tr>`)}
          <p>Method: ${escapeHtml(forecast.method)} Capacity is estimated from current schedules; a positive gap is not a staffing instruction.</p>
        </div>
        <div class="card">
          <h3>Patient journey drop-off</h3>
          <p>${escapeHtml(funnel.scope)} Steps less than ${funnel.maturityMinutes} minutes old are excluded.</p>
          ${renderAnalyticsTable('', ['Journey stage', 'Matured journeys'], funnelRows, item =>
            `<tr><td>${escapeHtml(item.name)}</td><td>${item.value}</td></tr>`)}
          ${renderAnalyticsTable('Estimated drop-off by stage', ['Stage', 'Journeys', 'Drop-off'], dropOffRows, item =>
            `<tr><td>${escapeHtml(item.name)}</td><td>${item.count}</td><td>${item.percent === null ? '—' : `${item.percent}%`}</td></tr>`)}
        </div>
        <div class="card">
          <h3>Operational planning signals</h3>
          <p>Peak appointment day: ${escapeHtml(report.charts.peakDays[0]?.name || 'No data')} (${report.charts.peakDays[0]?.value || 0} bookings)</p>
          <p>Peak appointment hour: ${escapeHtml(report.charts.peakHours[0]?.name || 'No data')} (${report.charts.peakHours[0]?.value || 0} bookings)</p>
          <p>Current-period unused-slot gross value: ${currency(report.strategic.planning.unutilizedSlotGrossValue)} at configured consultation fees; not guaranteed revenue.</p>
          <p>Patient satisfaction: ${report.strategic.planning.patientFeedbackAvailable ? 'Available' : 'Unavailable — no feedback integration'}.</p>
          <p>Consultation-room utilization: ${report.strategic.planning.consultationRoomUtilizationAvailable ? 'Available' : 'Unavailable — no room integration'}.</p>
        </div>
      </div>
    </section>
    ${renderAnalyticsTable('Revenue by visit category', ['Visit category', 'Invoiced', 'Collected'], report.charts.visitCategoryRevenue, item =>
      `<tr><td>${escapeHtml(item.name)}</td><td>${currency(item.invoiced)}</td><td>${currency(item.collected)}</td></tr>`)}
    ${renderAnalyticsTable('Department performance, capacity and growth', ['Department', 'Appointments', 'Completed', 'Capacity*', 'Utilization*', 'Unused slots', 'Growth vs prior period', 'Invoiced', 'Collected'], report.charts.departments, item =>
      `<tr><td>${escapeHtml(item.name)}</td><td>${item.appointments}</td><td>${item.completed}</td><td>${item.capacity}</td><td>${item.utilizationPercent === null ? '—' : `${item.utilizationPercent}%`}</td><td>${item.unutilizedSlots}</td><td>${item.growthPercent === null ? 'No prior baseline' : `${item.growthPercent}%`}</td><td>${currency(item.invoiced)}</td><td>${currency(item.collected)}</td></tr>`)}
    ${renderAnalyticsTable('Doctor productivity and growth', ['Doctor', 'Appointments', 'Patients consulted', 'Capacity*', 'Utilization*', 'Unused slots', 'Growth vs prior period', 'Invoiced', 'Collected'], report.charts.doctors, item =>
      `<tr><td>${escapeHtml(item.name)}</td><td>${item.appointments}</td><td>${item.completed}</td><td>${item.capacity}</td><td>${item.utilizationPercent === null ? '—' : `${item.utilizationPercent}%`}</td><td>${item.unutilizedSlots}</td><td>${item.growthPercent === null ? 'No prior baseline' : `${item.growthPercent}%`}</td><td>${currency(item.invoiced)}</td><td>${currency(item.collected)}</td></tr>`)}
    ${renderAnalyticsTable('Patient categories', ['Category', 'Patients'], [
      { name: 'New in selected period', value: summary.newPatients },
      { name: 'Existing / returning', value: summary.existingPatients },
      { name: 'Repeat completed consultations', value: summary.repeatConsultations }
    ], item => `<tr><td>${escapeHtml(item.name)}</td><td>${item.value}</td></tr>`)}
    <div class="card bi-coverage">
      <h2>Data coverage and interpretation</h2>
      <p>${escapeHtml(report.notes.join(' '))}</p>
      <p>* Capacity is estimated from the currently configured schedule, not an archived schedule version. Low patient penetration cannot be inferred without an external catchment population denominator.</p>
      <p>Patient counts are aggregated by the demographic fields currently available. Missing country, locality, or postal code values are grouped as Unknown.</p>
    </div>`;
  bindRegistrationOverview(report);
}

async function loadAnalytics() {
  const errorBox = $('#analytics-error');
  const runButton = $('#btn-load-analytics');
  errorBox.hidden = true;
  runButton.disabled = true;
  try {
    const filterValue = id => $(`#${id}`)?.value || '';
    const params = new URLSearchParams({
      startDate: $('#analytics-start').value,
      endDate: $('#analytics-end').value,
      period: $('#analytics-period').value,
      departmentId: $('#analytics-department').value,
      doctorId: $('#analytics-doctor').value,
      ageGroup: filterValue('analytics-age'),
      gender: filterValue('analytics-gender'),
      state: filterValue('analytics-state').trim(),
      district: filterValue('analytics-district').trim(),
      pincode: filterValue('analytics-pincode').trim(),
      country: filterValue('analytics-country').trim(),
      postOffice: filterValue('analytics-post-office').trim(),
      locality: filterValue('analytics-locality').trim()
    });
    const response = await api(`/reports/analytics?${params}`);
    state.analyticsQuery = params.toString();
    state.analyticsReport = response.data;
    if (state.analyticsMode !== 'live') return;
    renderAnalyticsResults(response.data);
    $('#btn-export-analytics').disabled = false;
    $('#btn-export-csv').disabled = false;
    $('#btn-print-analytics').disabled = false;
  } catch (error) {
    state.analyticsQuery = null;
    state.analyticsReport = null;
    if (state.analyticsMode !== 'live') return;
    errorBox.textContent = error.message;
    errorBox.hidden = false;
    $('#analytics-results').innerHTML = '';
    $('#btn-export-analytics').disabled = true;
    $('#btn-export-csv').disabled = true;
    $('#btn-print-analytics').disabled = true;
  } finally {
    runButton.disabled = false;
  }
}

function setAnalyticsMode(mode) {
  state.analyticsMode = mode;
  const demo = mode === 'demo';
  $('#btn-live-report').classList.toggle('active', !demo);
  $('#btn-demo-report').classList.toggle('active', demo);
  $('#btn-live-report').setAttribute('aria-pressed', String(!demo));
  $('#btn-demo-report').setAttribute('aria-pressed', String(demo));
  $('#btn-demo-print').hidden = !demo;
  $('#analytics-filters').hidden = demo;
  const scheduled = $('.scheduled-report-panel');
  if (scheduled) scheduled.hidden = demo;
  $('#analytics-error').hidden = true;
  if (demo) {
    const report = registrationDemoReport();
    $('#analytics-results').innerHTML = renderRegistrationDashboard(report, true);
    bindRegistrationOverview(report);
  } else if (state.analyticsReport) {
    renderAnalyticsResults(state.analyticsReport);
    $('#btn-export-analytics').disabled = false;
    $('#btn-export-csv').disabled = false;
    $('#btn-print-analytics').disabled = false;
  } else {
    loadAnalytics();
  }
}

async function exportAnalyticsExcel() {
  if (!state.analyticsQuery || !state.analyticsReport) return;
  try {
    const response = await fetch(`/api/reports/analytics.xlsx?${state.analyticsQuery}`, { credentials: 'same-origin' });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Excel export failed');
    }
    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement('a');
    link.href = url;
    link.download = `vitalyes-bi-${state.analyticsReport.period.startDate}-${state.analyticsReport.period.endDate}.xlsx`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (error) {
    toast(error.message);
  }
}

async function loadScheduledReports() {
  const container = $('#scheduled-report-list');
  try {
    const response = await api('/reports/scheduled');
    container.innerHTML = response.data.length
      ? `<ul class="scheduled-report-list">${response.data.map(item => `<li><span><strong>${escapeHtml(item.scheduleName)}</strong><small>${escapeHtml(item.startDate)} to ${escapeHtml(item.endDate)} • ${escapeHtml(item.generatedAt)}</small></span><a class="btn btn-outline btn-compact" href="/api/reports/scheduled/${encodeURIComponent(item.id)}">Download Excel</a></li>`).join('')}</ul>`
      : '<p>No scheduled reports have been generated yet. Configure an enabled schedule in Administrative Settings.</p>';
  } catch (error) {
    container.textContent = `Unable to load scheduled reports: ${error.message}`;
  }
}

function registrationAnalyticsCsvRows(data) {
  if (!data) return [];
  const { trends, doctors, departments, registrationTypes, ...metrics } = data;
  return [
    [], ['Registration overview', 'Value'],
    ['Basis', 'Patient creation dates; booking mix uses appointment dates and all statuses'],
    ['Acquisition rate', 'New patient registrations / distinct report patients'],
    ['Review and revisit rates', 'Category bookings / all bookings'],
    ...Object.entries(registrationTypes).map(([type, value]) => [`Registration type: ${type}`, value]),
    ...Object.entries(metrics).map(([key, value]) => [key, value ?? 'No data']),
    [], ['Registration trend interval', 'Period', 'Registrations'],
    ...Object.entries(trends).flatMap(([interval, values]) => values.map(item => [interval, item.name, item.value])),
    ...[['Department booking mix', departments], ['Doctor booking mix', doctors]].flatMap(([title, values]) => [
      [], [title, 'Bookings', 'Patients', 'New consultations', 'Review', 'Revisit', 'Unclassified', 'Booking growth %'],
      ...values.map(item => [item.name, item.total, item.patients, item.newConsultations, item.reviews, item.revisits, item.unclassified, item.growthPercent ?? 'No prior baseline'])
    ])
  ];
}

function exportAnalyticsCsv() {
  const report = state.analyticsReport;
  if (!report) return;
  if (report.view) {
    const rows = [
      ['Hospital', report.period.hospitalName],
      ['Reporting period', report.period.reportPeriod],
      ['Start date', report.period.startDate],
      ['End date', report.period.endDate],
      ['Report view', report.view],
      ['Generated at', report.generatedAt],
      [],
      ['Metric', 'Value'],
      ...Object.entries(report.summary),
      ...registrationAnalyticsCsvRows(report.registrationAnalytics),
      ...Object.entries(report.charts).flatMap(([name, values]) => {
        if (Array.isArray(values)) {
          const columns = [...new Set(values.flatMap(item => Object.keys(item || {})))];
          return [[], [name, ...columns], ...values.map(item => columns.map(column => item[column] ?? ''))];
        }
        return [[], [name, 'Value'], ...Object.entries(values || {}).map(([key, value]) => [key, value])];
      })
    ];
    downloadAnalyticsCsv(rows, report);
    return;
  }
  const rows = [
    ['Hospital', report.period.hospitalName],
    ['Hospital code', report.period.hospitalCode],
    ['Reporting period', report.period.reportPeriod],
    ['Start date', report.period.startDate],
    ['End date', report.period.endDate],
    ['Generated at', report.generatedAt],
    [],
    ['Filters', 'Value'],
    ...Object.entries(report.filters).map(([name, value]) => [name, value ?? 'All']),
    [],
    ['Metric', 'Value'],
    ...Object.entries(report.summary),
    ...registrationAnalyticsCsvRows(report.registrationAnalytics),
    [],
    ['Period comparison', 'Current', 'Previous', 'Growth %'],
    ...report.charts.periodComparisons.map(item => [item.name, item.current, item.previous, item.growthPercent ?? 'No prior baseline']),
    [],
    ['Target', 'Period', 'Target', 'Actual', 'Variance', 'Attainment %'],
    ...report.strategic.targetComparisons.map(item => [item.metric, item.period, item.target, item.actual, item.variance, item.attainmentPercent ?? '']),
    [],
    ['Department', 'Appointments', 'Completed', 'Capacity estimate', 'Utilization %', 'Unused slots', 'Growth %', 'Invoiced', 'Collected'],
    ...report.charts.departments.map(item => [item.name, item.appointments, item.completed, item.capacity, item.utilizationPercent ?? '', item.unutilizedSlots, item.growthPercent ?? '', item.invoiced, item.collected]),
    [],
    ['Doctor', 'Appointments', 'Patients consulted', 'Capacity estimate', 'Utilization %', 'Unused slots', 'Growth %', 'Invoiced', 'Collected'],
    ...report.charts.doctors.map(item => [item.name, item.appointments, item.completed, item.capacity, item.utilizationPercent ?? '', item.unutilizedSlots, item.growthPercent ?? '', item.invoiced, item.collected]),
    [],
    ['Forecast department', 'Status', 'Observed months', 'Projected visits', 'Scheduled capacity', 'Demand-capacity gap', 'Additional sessions'],
    ...report.strategic.demandForecast.departments.map(item => [
      item.name, item.status, item.observedHistoryMonths, item.forecastVisits ?? '',
      item.nextMonthCapacity, item.capacityGap ?? '', item.status === 'projected' ? item.additionalSessions : ''
    ]),
    [],
    ['Patient journey drop-off stage', 'Journeys', 'Drop-off %'],
    ...Object.entries(report.strategic.conversionFunnel.dropOff).map(([name, item]) => [
      name, item.count, item.percent ?? ''
    ]),
    [],
    ['Age group', 'Patient count'],
    ...report.charts.ageGroups.map(item => [item.name, item.value]),
    [],
    ['District', 'Patient count', 'Revenue'],
    ...report.charts.districts.map(item => [item.name, item.value, report.charts.geographyRevenue.find(area => area.name === item.name)?.value || 0])
  ];
  downloadAnalyticsCsv(rows, report);
}

function downloadAnalyticsCsv(rows, report) {
  const csv = rows.map(row => row.map(value => {
    const text = String(value ?? '');
    const safeText = typeof value === 'string' && /^[\s]*[=+\-@]/.test(text) ? `'${text}` : text;
    return `"${safeText.replace(/"/g, '""')}"`;
  }).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `vitalyes-bi-${report.period.startDate}-${report.period.endDate}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function setAdminLayout(enabled) {
  $('#app').classList.toggle('admin-mode', enabled);
  if (enabled) $('#app').classList.remove('welcome-mode');
}

function renderAdminAccess() {
  if (!state.staff) return renderStaffLogin('settings');
  if (!state.staff.canManageSettings) return renderAdminPortal();
  setAdminLayout(true);
  setHomeButton(false);
  if (state.adminUnlocked) {
    main().innerHTML = '<section class="screen settings-screen"><p class="screen-subtitle">Loading settings…</p></section>';
    attachAdminNavigation('settings');
    adminApi('/config').then(response => {
      state.adminConfig = response.data;
      renderAdminSettings();
    }).catch(error => {
      state.adminUnlocked = false;
      toast(error.message);
      renderAdminAccess();
    });
    return;
  }
  main().innerHTML = `
    <section class="screen settings-screen">
      <h1 class="screen-title">Administrative Settings</h1>
      <div class="prototype-banner">Settings require a staff account with configuration permission. Use synthetic data only.</div>
      <div class="card">
        ${state.adminCredentialsConfigured ? `
          <div class="form-group">
            <label for="admin-username">Username</label>
            <input id="admin-username" class="form-control" type="text" autocomplete="username" required>
          </div>
          <div class="form-group">
            <label for="admin-password">Password</label>
            <input id="admin-password" class="form-control" type="password" autocomplete="current-password" required>
          </div>
        ` : '<div class="admin-login-notice">Administrator sign-in is disabled. Ask your system administrator to configure VITALYES_ADMIN_USERNAME and VITALYES_ADMIN_PASSWORD.</div>'}
        <div id="admin-access-error" class="error-box" hidden></div>
        <div class="btn-group">
          <button class="btn btn-primary" id="btn-admin-unlock" ${state.adminCredentialsConfigured ? '' : 'disabled'}>Open settings</button>
          <button class="btn btn-outline" id="btn-admin-back">Back</button>
        </div>
      </div>
    </section>`;
  attachAdminNavigation('settings');
  $('#btn-admin-back').onclick = () => navigateStaffPage('admin');
  $('#btn-admin-unlock').onclick = async () => {
    const username = $('#admin-username')?.value || '';
    const password = $('#admin-password')?.value || '';
    if (!username || !password) return toast('Enter the administrator username and password.');
    $('#btn-admin-unlock').disabled = true;
    try {
      await api('/admin/login', { method: 'POST', body: JSON.stringify({ username, password }) });
      state.adminUnlocked = true;
      const response = await adminApi('/config');
      state.adminConfig = response.data;
      renderAdminSettings();
    } catch (error) {
      state.adminUnlocked = false;
      const errorBox = $('#admin-access-error');
      errorBox.textContent = error.message;
      errorBox.hidden = false;
      $('#btn-admin-unlock').disabled = !state.adminCredentialsConfigured;
    }
  };
}

function renderAdminSettings() {
  setAdminLayout(true);
  setHomeButton(false);
  const config = state.adminConfig;
  main().innerHTML = `
    <section class="screen settings-screen">
      <h1 class="screen-title">Centralised Settings</h1>
      <p class="screen-subtitle">Changes are saved to the prototype's JSON configuration.</p>
      <div class="prototype-banner">Prototype only. Staff roles control access; payment settings do not connect to a real gateway.</div>
      <div class="settings-group-heading"><h2 id="settings-group-title"></h2><p>Review and edit demo values for the selected category.</p></div>
      <div class="card settings-section" data-settings-group="facility">
        <h2>Hospital configuration</h2>
        <div class="form-row">
          <div class="form-group"><label for="setting-hospitalName">Hospital name</label><input id="setting-hospitalName" class="form-control" value="${escapeHtml(config.hospitalName)}" required></div>
          <div class="form-group"><label for="setting-hospitalCode">Hospital code</label><input id="setting-hospitalCode" class="form-control" value="${escapeHtml(config.hospitalCode)}" required></div>
        </div>
        <div class="form-group"><label for="setting-hospitalCountry">Hospital country</label><input id="setting-hospitalCountry" class="form-control" value="${escapeHtml(config.country || 'India')}" required></div>
        <div class="form-row">
          <div class="form-group"><label for="setting-currency">Currency code</label><input id="setting-currency" class="form-control" value="${escapeHtml(config.currency)}" maxlength="3" required></div>
          <div class="form-group"><label for="setting-currencySymbol">Currency symbol</label><input id="setting-currencySymbol" class="form-control" value="${escapeHtml(config.currencySymbol)}" required></div>
        </div>
        <div class="form-group"><label for="setting-timeZone">Hospital time zone (IANA)</label><input id="setting-timeZone" class="form-control" value="${escapeHtml(config.timeZone || 'Asia/Kolkata')}" placeholder="Asia/Kolkata" required></div>
      </div>
      <div class="card settings-section" data-settings-group="facility">
        <div class="settings-section-heading"><h2>Languages</h2><button class="btn btn-outline btn-compact" id="btn-add-language">Add language</button></div>
        <p class="settings-help">Adding a language makes it selectable; translated application strings must also be provided before that locale is fully supported.</p>
        <div id="admin-languages"></div>
      </div>
      <div class="card settings-section" data-settings-group="care">
        <div class="settings-section-heading"><h2>Departments</h2><button class="btn btn-outline btn-compact" id="btn-add-department">Add department</button></div>
        <p class="settings-help">Edit or delete a department below, then select Save settings to apply your changes.</p>
        <div id="admin-departments"></div>
      </div>
      <div class="card settings-section" data-settings-group="care">
        <div class="settings-section-heading"><h2>Doctors and schedules</h2><button class="btn btn-outline btn-compact" id="btn-add-doctor">Add doctor</button></div>
        <p class="settings-help">Edit a doctor to update their details and schedule. Changes are applied when you select Save settings.</p>
        <div id="admin-doctors"></div>
      </div>
      <div class="card settings-section" data-settings-group="visits">
        <h2>Fees, review rules, and tokens</h2>
        <div class="form-row">
          <div class="form-group"><label for="setting-registrationFee">Registration charge</label><input id="setting-registrationFee" class="form-control" type="number" min="0" step="0.01" value="${escapeHtml(config.charges.registrationFee)}"></div>
          <div class="form-group"><label for="setting-consultationBase">Base consultation charge</label><input id="setting-consultationBase" class="form-control" type="number" min="0" step="0.01" value="${escapeHtml(config.charges.consultationBase)}"></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label for="setting-tokenFee">Token charge</label><input id="setting-tokenFee" class="form-control" type="number" min="0" step="0.01" value="${escapeHtml(config.charges.tokenFee)}"></div>
          <div class="form-group"><label for="setting-reviewDays">Free review period (calendar days)</label><input id="setting-reviewDays" class="form-control" type="number" min="1" step="1" value="${escapeHtml(config.reviewRules.freeReviewDays)}"></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label for="setting-countingRule">Review day-count rule</label><select id="setting-countingRule" class="form-control">
            <option value="calendar_days_inclusive" ${config.reviewRules.countingRule === 'calendar_days_inclusive' ? 'selected' : ''}>Inclusive (consultation day is day 1)</option>
            <option value="calendar_days_exclusive" ${config.reviewRules.countingRule === 'calendar_days_exclusive' ? 'selected' : ''}>Exclusive (count starts next day)</option>
          </select></div>
          <div class="form-group"><label for="setting-tokenFormat">Token format</label><input id="setting-tokenFormat" class="form-control" value="${escapeHtml(config.tokenFormat)}"></div>
        </div>
        <p class="settings-help">Token format must include {doctorCode}, {DDMMYY}, and {sequence}.</p>
      </div>
      <div class="card settings-section" data-settings-group="payments">
        <h2>Payment configuration</h2>
        <p class="settings-help">This prototype only simulates payment. Never enter payment credentials here.</p>
        <div class="form-group"><label for="setting-payment-provider">Provider label (display/configuration only)</label><input id="setting-payment-provider" class="form-control" value="${escapeHtml(config.paymentConfig.providerName || '')}"></div>
        <div class="settings-checks">
          ${[['upi', 'UPI'], ['card', 'Debit / Credit card'], ['netBanking', 'Net banking'], ['cash', 'Cash at authorised counter']].map(([value, label]) => `
            <label><input type="checkbox" name="payment-method" value="${value}" ${config.paymentConfig.enabledMethods.includes(value) ? 'checked' : ''}> ${label}</label>`).join('')}
        </div>
        <label class="settings-check"><input id="setting-counter-enabled" type="checkbox" ${config.paymentConfig.counterConfirmationEnabled ? 'checked' : ''}> Enable simulated authorised counter confirmation</label>
      </div>
      ${state.localLoginAvailable ? `<div class="card settings-section" data-settings-group="users">
        <h2>Staff users</h2>
        <p class="settings-help">Create staff or administrator accounts using saved roles and departments. To confirm counter payments, assign a role with payment:collect, such as Front Office. Passwords must contain at least 12 characters.</p>
        <div id="staff-users-list" class="settings-help">Loading staff users…</div>
        <form id="create-staff-user">
          <div class="form-row">
            <div class="form-group"><label for="new-staff-name">Name</label><input id="new-staff-name" class="form-control" maxlength="100" required></div>
            <div class="form-group"><label for="new-staff-username">Username</label><input id="new-staff-username" class="form-control" minlength="3" maxlength="64" pattern="[A-Za-z0-9._-]+" autocomplete="off" required></div>
          </div>
          <div class="form-group"><label for="new-staff-password">Password</label><input id="new-staff-password" class="form-control" type="password" minlength="12" maxlength="256" autocomplete="new-password" required></div>
          <fieldset class="staff-user-fieldset"><legend>Roles</legend><div class="settings-checks">${config.roles.map(role => `<label><input type="checkbox" name="new-staff-role" value="${escapeHtml(role.name)}"> ${escapeHtml(role.name)}</label>`).join('')}</div></fieldset>
          <fieldset class="staff-user-fieldset"><legend>Departments (required for department reporting)</legend><div class="settings-checks">${config.departments.map(department => `<label><input type="checkbox" name="new-staff-department" value="${escapeHtml(department.id)}"> ${escapeHtml(department.name)}</label>`).join('')}</div></fieldset>
          <div id="staff-user-error" class="error-box" hidden></div>
          <button type="submit" class="btn btn-primary btn-compact">Create user</button>
        </form>
      </div>` : ''}
      <div class="card settings-section" data-settings-group="access">
        <h2>User roles and access-control definitions</h2>
        <p class="settings-help">The server enforces these permissions for assigned roles. Save role and department changes before assigning them to users.</p>
        <textarea id="setting-roles" class="form-control settings-json" spellcheck="false">${escapeHtml(JSON.stringify(config.roles, null, 2))}</textarea>
      </div>
      <div class="card settings-section" data-settings-group="reports">
        <h2>Report configuration</h2>
        <p class="settings-help">Targets use entries like {"metric":"footfall","period":"monthly","value":200}. Schedules use {"id":"daily-ops","name":"Daily operations","enabled":true,"frequency":"daily","time":"08:00"}; supported frequencies are daily, weekly, monthly, quarterly and annual. Optional departmentId and doctorId scope a schedule. Generated reports are aggregated Excel files stored locally; recipients and email delivery are not configured.</p>
        <textarea id="setting-reportConfig" class="form-control settings-json" spellcheck="false">${escapeHtml(JSON.stringify(config.reportConfig, null, 2))}</textarea>
      </div>
      <div id="admin-save-error" class="error-box" hidden></div>
      <div class="btn-group">
        <button class="btn btn-primary" id="btn-save-settings">Save settings</button>
        <button class="btn btn-outline" id="btn-admin-lock">Lock settings and return home</button>
      </div>
    </section>`;

  attachAdminNavigation('settings');
  renderAdminLanguageRows();
  renderAdminDepartmentRows();
  renderAdminDoctorCards();
  setSettingsGroup(state.settingsGroup);
  if (state.localLoginAvailable) {
    loadStaffUsers();
    $('#create-staff-user').addEventListener('submit', createStaffUser);
  }

  $('#btn-add-language').onclick = () => updateAdminConfig(config => config.languages.push({ code: '', label: '' }));
  $('#btn-add-department').onclick = () => {
    if (updateAdminConfig(config => config.departments.push({ id: '', name: '', nameHi: '' }))) {
      openSettingsEditor('department', state.adminConfig.departments.length - 1);
    }
  };
  $('#btn-add-doctor').onclick = () => {
    if (updateAdminConfig(config => config.doctors.push({
      id: '', code: '', name: '', department: config.departments[0]?.id || '', fee: 0,
      schedule: { workingDays: [1], sessions: [{ start: '09:00', end: '17:00' }], breaks: [], slotDurationMinutes: 30, capacityPerSlot: 1, unavailableDates: [], specialWorkingDays: [] }
    }))) {
      openSettingsEditor('doctor', state.adminConfig.doctors.length - 1);
    }
  };
  $('#btn-save-settings').onclick = saveAdminSettings;
  $('#btn-admin-lock').onclick = async () => {
    try {
      await adminApi('/logout', { method: 'POST' });
      state.adminUnlocked = false;
      state.adminConfig = null;
      navigateStaffPage('admin');
    } catch (error) {
      toast(`Could not lock settings: ${error.message}`);
    }
  };
}

async function loadStaffUsers() {
  const list = $('#staff-users-list');
  try {
    const response = await adminApi('/users');
    if (!list.isConnected) return;
    list.innerHTML = response.data.length
      ? `<ul class="staff-users-list">${response.data.map(user => `<li><strong>${escapeHtml(user.name)}</strong> (${escapeHtml(user.username)}) — ${escapeHtml(user.roles.join(', '))}${user.departmentIds.length ? ` · ${escapeHtml(user.departmentIds.join(', '))}` : ''}</li>`).join('')}</ul>`
      : '<p>No staff users created yet.</p>';
  } catch (error) {
    if (list.isConnected) list.textContent = `Could not load staff users: ${error.message}`;
  }
}

async function createStaffUser(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('button[type="submit"]');
  const errorBox = $('#staff-user-error');
  const data = {
    name: $('#new-staff-name').value,
    username: $('#new-staff-username').value,
    password: $('#new-staff-password').value,
    roles: [...form.querySelectorAll('input[name="new-staff-role"]:checked')].map(input => input.value),
    departmentIds: [...form.querySelectorAll('input[name="new-staff-department"]:checked')].map(input => input.value)
  };
  errorBox.hidden = true;
  button.disabled = true;
  try {
    await adminApi('/users', { method: 'POST', body: JSON.stringify(data) });
    form.reset();
    toast('Staff user created.');
    await loadStaffUsers();
  } catch (error) {
    errorBox.textContent = error.message;
    errorBox.hidden = false;
  } finally {
    button.disabled = false;
  }
}

function updateAdminConfig(change) {
  try {
    state.adminConfig = readAdminForm();
    change(state.adminConfig);
    renderAdminSettings();
    return true;
  } catch (error) {
    toast(error.message);
    return false;
  }
}

function openSettingsEditor(type, index) {
  const editor = $(`#${type}-editor-${index}`);
  const button = $(`[data-edit-${type}="${index}"]`);
  editor.hidden = false;
  button.setAttribute('aria-expanded', 'true');
  editor.querySelector('input, select, textarea')?.focus();
}

function attachSettingsTableActions(type) {
  document.querySelectorAll(`[data-edit-${type}]`).forEach(button => {
    button.onclick = () => {
      const index = Number(button.dataset[`edit${type[0].toUpperCase()}${type.slice(1)}`]);
      const editor = $(`#${type}-editor-${index}`);
      if (editor.hidden) openSettingsEditor(type, index);
      else {
        editor.hidden = true;
        button.setAttribute('aria-expanded', 'false');
      }
    };
  });
  document.querySelectorAll(`[data-delete-${type}]`).forEach(button => {
    button.onclick = () => {
      const index = Number(button.dataset[`delete${type[0].toUpperCase()}${type.slice(1)}`]);
      let config;
      try {
        config = readAdminForm();
      } catch (error) {
        toast(error.message);
        return;
      }
      const item = type === 'department' ? config.departments[index] : config.doctors[index];
      if (type === 'department' && config.doctors.some(doctor => doctor.department === item.id)) {
        return toast('Move or remove the doctors assigned to this department before deleting it.');
      }
      if (config.reportConfig.schedules.some(schedule =>
        type === 'department' ? schedule.departmentId === item.id : schedule.doctorId === item.id)) {
        return toast(`Remove report schedules linked to this ${type} before deleting it.`);
      }
      if (!window.confirm(`Delete ${item.name || `this ${type}`}? Select Save settings to apply the deletion.`)) return;
      updateAdminConfig(candidate => {
        const items = type === 'department' ? candidate.departments : candidate.doctors;
        items.splice(index, 1);
      });
    };
  });
}

function renderAdminLanguageRows() {
  $('#admin-languages').innerHTML = state.adminConfig.languages.map((language, index) => `
    <div class="settings-row language-row" data-index="${index}">
      <div class="form-group"><label>Language code</label><input class="form-control language-code" value="${escapeHtml(language.code)}" placeholder="e.g. ml"></div>
      <div class="form-group"><label>Display label</label><input class="form-control language-label" value="${escapeHtml(language.label)}" placeholder="e.g. മലയാളം"></div>
      <button class="btn btn-danger btn-compact remove-language" type="button" aria-label="Remove language">Remove</button>
    </div>`).join('');
  document.querySelectorAll('.remove-language').forEach(button => {
    button.onclick = () => {
      const index = Number(button.closest('.language-row').dataset.index);
      updateAdminConfig(config => config.languages.splice(index, 1));
    };
  });
}

function renderAdminDepartmentRows() {
  const departments = state.adminConfig.departments;
  $('#admin-departments').innerHTML = `
    <div class="table-wrap">
      <table class="report-table settings-table">
        <thead><tr><th scope="col">ID</th><th scope="col">Department</th><th scope="col">Hindi name</th><th scope="col">Actions</th></tr></thead>
        <tbody>${departments.map((department, index) => `
          <tr id="department-summary-${index}">
            <td class="summary-id">${escapeHtml(department.id || 'New')}</td>
            <td class="summary-name">${escapeHtml(department.name || 'New department')}</td>
            <td class="summary-hindi">${escapeHtml(department.nameHi || '—')}</td>
            <td><div class="settings-actions">
              <button class="btn btn-outline btn-compact" type="button" data-edit-department="${index}" aria-expanded="false" aria-controls="department-editor-${index}">Edit</button>
              <button class="btn btn-danger btn-compact" type="button" data-delete-department="${index}" aria-label="Delete ${escapeHtml(department.name || 'new department')}">Delete</button>
            </div></td>
          </tr>`).join('') || '<tr><td colspan="4">No departments configured yet.</td></tr>'}</tbody>
      </table>
    </div>
    ${departments.map((department, index) => `
      <div class="settings-editor department-row" id="department-editor-${index}" data-index="${index}" hidden>
        <h3>Edit department</h3>
        <div class="form-row">
          <div class="form-group"><label for="department-id-${index}">Department ID</label><input id="department-id-${index}" class="form-control department-id" value="${escapeHtml(department.id)}"></div>
          <div class="form-group"><label for="department-name-${index}">English name</label><input id="department-name-${index}" class="form-control department-name" value="${escapeHtml(department.name)}"></div>
        </div>
        <div class="form-group"><label for="department-hindi-${index}">Hindi name (optional)</label><input id="department-hindi-${index}" class="form-control department-name-hi" value="${escapeHtml(department.nameHi || '')}"></div>
      </div>`).join('')}`;
  attachSettingsTableActions('department');
  document.querySelectorAll('.department-row').forEach(editor => {
    editor.addEventListener('input', () => {
      const summary = $(`#department-summary-${editor.dataset.index}`);
      summary.querySelector('.summary-id').textContent = editor.querySelector('.department-id').value || 'New';
      summary.querySelector('.summary-name').textContent = editor.querySelector('.department-name').value || 'New department';
      summary.querySelector('.summary-hindi').textContent = editor.querySelector('.department-name-hi').value || '—';
    });
  });
}

function renderAdminDoctorCards() {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const doctors = state.adminConfig.doctors;
  $('#admin-doctors').innerHTML = `
    <div class="table-wrap">
      <table class="report-table settings-table">
        <thead><tr><th scope="col">Doctor</th><th scope="col">ID / code</th><th scope="col">Department</th><th scope="col">Fee</th><th scope="col">Working days</th><th scope="col">Actions</th></tr></thead>
        <tbody>${doctors.map((doctor, index) => `
          <tr id="doctor-summary-${index}">
            <td class="summary-name">${escapeHtml(doctor.name || 'New doctor')}</td>
            <td class="summary-id">${escapeHtml(doctor.id || 'New')} / ${escapeHtml(doctor.code || '—')}</td>
            <td class="summary-department">${escapeHtml(state.adminConfig.departments.find(department => department.id === doctor.department)?.name || '—')}</td>
            <td class="summary-fee">${escapeHtml(currency(doctor.fee))}</td>
            <td class="summary-days">${escapeHtml((doctor.schedule?.workingDays || []).map(day => days[day]).join(', ') || '—')}</td>
            <td><div class="settings-actions">
              <button class="btn btn-outline btn-compact" type="button" data-edit-doctor="${index}" aria-expanded="false" aria-controls="doctor-editor-${index}">Edit</button>
              <button class="btn btn-danger btn-compact" type="button" data-delete-doctor="${index}" aria-label="Delete ${escapeHtml(doctor.name || 'new doctor')}">Delete</button>
            </div></td>
          </tr>`).join('') || '<tr><td colspan="6">No doctors configured yet.</td></tr>'}</tbody>
      </table>
    </div>
    ${doctors.map((doctor, index) => {
    const schedule = doctor.schedule || {};
    const ranges = items => (items || []).map(item => `${item.start}-${item.end}`).join('\n');
    return `
      <div class="settings-doctor settings-editor" id="doctor-editor-${index}" data-index="${index}" hidden>
        <div class="settings-section-heading"><h3>Edit ${escapeHtml(doctor.name || 'new doctor')}</h3></div>
        <div class="form-row">
          <div class="form-group"><label>Doctor ID</label><input class="form-control doctor-id" value="${escapeHtml(doctor.id)}"></div>
          <div class="form-group"><label>Doctor code</label><input class="form-control doctor-code" value="${escapeHtml(doctor.code)}"></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>Doctor name</label><input class="form-control doctor-name" value="${escapeHtml(doctor.name)}"></div>
          <div class="form-group"><label>Department</label><select class="form-control doctor-department">
            ${state.adminConfig.departments.map(department => `<option value="${escapeHtml(department.id)}" ${doctor.department === department.id ? 'selected' : ''}>${escapeHtml(department.name)}</option>`).join('')}
          </select></div>
        </div>
        <div class="form-group"><label>Consultation fee</label><input class="form-control doctor-fee" type="number" min="0" step="0.01" value="${escapeHtml(doctor.fee)}"></div>
        <div class="settings-checks">${days.map((day, dayIndex) => `<label><input class="doctor-working-day" type="checkbox" value="${dayIndex}" ${schedule.workingDays?.includes(dayIndex) ? 'checked' : ''}> ${day}</label>`).join('')}</div>
        <div class="form-row">
          <div class="form-group"><label>Consultation sessions (one HH:MM-HH:MM per line)</label><textarea class="form-control doctor-sessions" rows="3">${escapeHtml(ranges(schedule.sessions))}</textarea></div>
          <div class="form-group"><label>Breaks (one HH:MM-HH:MM per line)</label><textarea class="form-control doctor-breaks" rows="3">${escapeHtml(ranges(schedule.breaks))}</textarea></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>Slot duration (minutes)</label><input class="form-control doctor-duration" type="number" min="1" step="1" value="${escapeHtml(schedule.slotDurationMinutes ?? 30)}"></div>
          <div class="form-group"><label>Capacity per slot</label><input class="form-control doctor-capacity" type="number" min="1" step="1" value="${escapeHtml(schedule.capacityPerSlot ?? 1)}"></div>
        </div>
        <div class="form-group"><label>Unavailable dates (one YYYY-MM-DD per line)</label><textarea class="form-control doctor-unavailable" rows="2">${escapeHtml((schedule.unavailableDates || []).join('\n'))}</textarea></div>
        <div class="form-group"><label>Special working days (JSON list)</label><textarea class="form-control doctor-special-days settings-json" rows="4" spellcheck="false">${escapeHtml(JSON.stringify(schedule.specialWorkingDays || [], null, 2))}</textarea><p class="settings-help">Each item needs a date and sessions, e.g. [{"date":"2026-12-25","sessions":[{"start":"09:00","end":"12:00"}]}].</p></div>
      </div>`;
  }).join('')}`;
  attachSettingsTableActions('doctor');
  document.querySelectorAll('.settings-doctor').forEach(editor => {
    const updateSummary = () => {
      const summary = $(`#doctor-summary-${editor.dataset.index}`);
      summary.querySelector('.summary-name').textContent = editor.querySelector('.doctor-name').value || 'New doctor';
      summary.querySelector('.summary-id').textContent = `${editor.querySelector('.doctor-id').value || 'New'} / ${editor.querySelector('.doctor-code').value || '—'}`;
      summary.querySelector('.summary-department').textContent = editor.querySelector('.doctor-department').selectedOptions[0]?.textContent || '—';
      summary.querySelector('.summary-fee').textContent = currency(editor.querySelector('.doctor-fee').value);
      summary.querySelector('.summary-days').textContent = [...editor.querySelectorAll('.doctor-working-day:checked')].map(input => days[Number(input.value)]).join(', ') || '—';
    };
    editor.addEventListener('input', updateSummary);
    editor.addEventListener('change', updateSummary);
  });
}

function parseTimeRanges(value, label) {
  const lines = value.split('\n').map(line => line.trim()).filter(Boolean);
  return lines.map(line => {
    const match = line.match(/^([0-2]\d:[0-5]\d)\s*-\s*([0-2]\d:[0-5]\d)$/);
    if (!match) throw new Error(`${label} must use HH:MM-HH:MM, one range per line.`);
    return { start: match[1], end: match[2] };
  });
}

function readAdminForm() {
  const config = structuredClone(state.adminConfig);
  config.hospitalName = $('#setting-hospitalName').value.trim();
  config.hospitalCode = $('#setting-hospitalCode').value.trim();
  config.country = $('#setting-hospitalCountry').value.trim();
  config.currency = $('#setting-currency').value.trim().toUpperCase();
  config.currencySymbol = $('#setting-currencySymbol').value.trim();
  config.timeZone = $('#setting-timeZone').value.trim();
  config.languages = [...document.querySelectorAll('.language-row')].map(row => ({
    code: row.querySelector('.language-code').value.trim(),
    label: row.querySelector('.language-label').value.trim()
  }));
  config.departments = [...document.querySelectorAll('.department-row')].map(row => ({
    id: row.querySelector('.department-id').value.trim(),
    name: row.querySelector('.department-name').value.trim(),
    nameHi: row.querySelector('.department-name-hi').value.trim()
  }));
  config.doctors = [...document.querySelectorAll('.settings-doctor')].map((card, index) => {
    const previous = state.adminConfig.doctors[index] || {};
    const schedule = previous.schedule || {};
    return {
      ...previous,
      id: card.querySelector('.doctor-id').value.trim(),
      code: card.querySelector('.doctor-code').value.trim(),
      name: card.querySelector('.doctor-name').value.trim(),
      department: card.querySelector('.doctor-department').value,
      fee: Number(card.querySelector('.doctor-fee').value),
      schedule: {
        ...schedule,
        workingDays: [...card.querySelectorAll('.doctor-working-day:checked')].map(input => Number(input.value)),
        sessions: parseTimeRanges(card.querySelector('.doctor-sessions').value, 'Sessions'),
        breaks: parseTimeRanges(card.querySelector('.doctor-breaks').value, 'Breaks'),
        slotDurationMinutes: Number(card.querySelector('.doctor-duration').value),
        capacityPerSlot: Number(card.querySelector('.doctor-capacity').value),
        unavailableDates: card.querySelector('.doctor-unavailable').value.split('\n').map(date => date.trim()).filter(Boolean),
        specialWorkingDays: JSON.parse(card.querySelector('.doctor-special-days').value || '[]')
      }
    };
  });
  config.charges = {
    ...config.charges,
    registrationFee: Number($('#setting-registrationFee').value),
    consultationBase: Number($('#setting-consultationBase').value),
    tokenFee: Number($('#setting-tokenFee').value)
  };
  config.reviewRules = {
    ...config.reviewRules,
    freeReviewDays: Number($('#setting-reviewDays').value),
    countingRule: $('#setting-countingRule').value
  };
  config.tokenFormat = $('#setting-tokenFormat').value.trim();
  config.paymentConfig = {
    ...config.paymentConfig,
    mode: 'simulated',
    providerName: $('#setting-payment-provider').value.trim(),
    enabledMethods: [...document.querySelectorAll('input[name="payment-method"]:checked')].map(input => input.value),
    counterConfirmationEnabled: $('#setting-counter-enabled').checked
  };
  config.roles = JSON.parse($('#setting-roles').value);
  config.reportConfig = JSON.parse($('#setting-reportConfig').value);
  return config;
}

async function saveAdminSettings() {
  const saveButton = $('#btn-save-settings');
  const errorBox = $('#admin-save-error');
  saveButton.disabled = true;
  errorBox.hidden = true;
  try {
    const config = readAdminForm();
    const response = await adminApi('/config', { method: 'PUT', body: JSON.stringify(config) });
    state.adminConfig = response.data;
    state.config = response.data;
    $('#hospital-name').textContent = state.config.hospitalName;
    toast('Settings saved successfully.');
    renderAdminSettings();
  } catch (error) {
    errorBox.textContent = error.message;
    errorBox.hidden = false;
  } finally {
    if ($('#btn-save-settings')) $('#btn-save-settings').disabled = false;
  }
}

function resetAndWelcome() {
  $('#app').classList.remove('bi-mode');
  setAdminLayout(false);
  Object.assign(state, {
    sessionId: null, mobile: null, mrn: null, identityMode: 'mobile', visitIntent: 'new',
    isNewPatient: false, patient: null, doctor: null, slot: null, appointmentDate: null, invoice: null,
    payment: null, token: null, prototypeOtp: null, departments: [], doctors: [], adminUnlocked: false, adminConfig: null
  });
  renderWelcome();
}

async function init() {
  $('#btn-home').addEventListener('click', resetAndWelcome);
  window.addEventListener('popstate', () => {
    const page = window.location.hash.match(/^#\/(admin|reports|analytics|settings)$/)?.[1];
    if (page) navigateStaffPage(page, false);
    else renderHome();
  });
  try {
    const response = await api('/config');
    state.config = response.data;
    const geography = await api('/geography');
    state.geography = geography.data;
    if (state.config.hospitalName) $('#hospital-name').textContent = state.config.hospitalName;
    const auth = await api('/auth/session');
    state.oidcConfigured = auth.configured;
    state.staff = auth.staff;
    state.adminCredentialsConfigured = auth.adminCredentialsConfigured;
    state.adminLoginAvailable = auth.adminLoginAvailable;
    state.localLoginAvailable = auth.localLoginAvailable;
    state.demoAdminDefaultCredentials = auth.demoAdminDefaultCredentials;
    state.adminUnlocked = auth.adminUnlocked;
  } catch (error) {
    main().innerHTML = `<div class="error-box">Could not load application configuration: ${escapeHtml(error.message)}</div>`;
    return;
  }
  const authError = new URLSearchParams(window.location.search).get('staffAuthError');
  const savedPage = state.staff ? sessionStorage.getItem('vitalyes.staffPage') : null;
  if (savedPage) sessionStorage.removeItem('vitalyes.staffPage');
  const route = window.location.hash.match(/^#\/(admin|reports|analytics|settings)$/)?.[1];
  if (!authError && (savedPage || route)) {
    navigateStaffPage(savedPage || route, false);
  } else {
    if (authError) sessionStorage.removeItem('vitalyes.staffPage');
    renderWelcome();
  }
  if (authError) {
    const messages = {
      hospital_scope: 'Your account is not assigned to this hospital.',
      login_failed: 'Staff sign-in was cancelled or rejected.',
      unmapped_role: 'Your account has no configured Vitalyes staff role or department assignment.'
    };
    const message = messages[authError] || 'Staff sign-in could not be completed.';
    toast(message, 6000);
    window.history.replaceState({}, '', '/');
  }
}

document.addEventListener('DOMContentLoaded', init);
