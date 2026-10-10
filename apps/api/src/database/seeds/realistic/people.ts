import type { Rng } from './rng';

/**
 * Fictional Indian people and places.
 *
 * Names are invented by combining common given names and surnames; phone numbers sit in the
 * +91 70000 xxxxx block and emails use the reserved `.test` TLD, so nothing here can reach a
 * real person. Cities, states and PIN-code prefixes are public geography; street addresses are
 * made up.
 */

export interface City {
  city: string;
  stateCode: string;
  stateName: string;
  /** First three digits of PIN codes in the city (public postal geography). */
  pin: string[];
  /** Relative weight for customer placement. */
  weight: number;
  areas: string[];
}

export const CITIES: City[] = [
  { city: 'Mumbai', stateCode: 'MH', stateName: 'Maharashtra', pin: ['400', '401'], weight: 9, areas: ['Andheri West', 'Bandra East', 'Powai', 'Dadar', 'Goregaon East', 'Malad West', 'Chembur'] },
  { city: 'Pune', stateCode: 'MH', stateName: 'Maharashtra', pin: ['411', '412'], weight: 6, areas: ['Kothrud', 'Baner', 'Viman Nagar', 'Hadapsar', 'Wakad', 'Aundh'] },
  { city: 'Nagpur', stateCode: 'MH', stateName: 'Maharashtra', pin: ['440'], weight: 2, areas: ['Dharampeth', 'Sadar', 'Manish Nagar'] },
  { city: 'Bengaluru', stateCode: 'KA', stateName: 'Karnataka', pin: ['560'], weight: 9, areas: ['Indiranagar', 'Koramangala', 'Whitefield', 'HSR Layout', 'Jayanagar', 'Electronic City', 'Yelahanka'] },
  { city: 'Mysuru', stateCode: 'KA', stateName: 'Karnataka', pin: ['570'], weight: 1, areas: ['Vijayanagar', 'Kuvempunagar'] },
  { city: 'New Delhi', stateCode: 'DL', stateName: 'Delhi', pin: ['110'], weight: 8, areas: ['Saket', 'Lajpat Nagar', 'Dwarka', 'Rohini', 'Janakpuri', 'Karol Bagh', 'Vasant Kunj'] },
  { city: 'Gurugram', stateCode: 'HR', stateName: 'Haryana', pin: ['122'], weight: 4, areas: ['DLF Phase 3', 'Sohna Road', 'Sector 56', 'Golf Course Road'] },
  { city: 'Noida', stateCode: 'UP', stateName: 'Uttar Pradesh', pin: ['201'], weight: 4, areas: ['Sector 62', 'Sector 18', 'Sector 137', 'Greater Noida West'] },
  { city: 'Lucknow', stateCode: 'UP', stateName: 'Uttar Pradesh', pin: ['226'], weight: 3, areas: ['Gomti Nagar', 'Aliganj', 'Indira Nagar'] },
  { city: 'Chennai', stateCode: 'TN', stateName: 'Tamil Nadu', pin: ['600'], weight: 7, areas: ['Adyar', 'Anna Nagar', 'T Nagar', 'Velachery', 'Porur', 'Mylapore'] },
  { city: 'Coimbatore', stateCode: 'TN', stateName: 'Tamil Nadu', pin: ['641'], weight: 2, areas: ['RS Puram', 'Peelamedu', 'Saibaba Colony'] },
  { city: 'Hyderabad', stateCode: 'TS', stateName: 'Telangana', pin: ['500'], weight: 8, areas: ['Madhapur', 'Gachibowli', 'Banjara Hills', 'Kukatpally', 'Begumpet', 'Secunderabad'] },
  { city: 'Kolkata', stateCode: 'WB', stateName: 'West Bengal', pin: ['700'], weight: 6, areas: ['Salt Lake', 'Ballygunge', 'New Town', 'Behala', 'Howrah'] },
  { city: 'Ahmedabad', stateCode: 'GJ', stateName: 'Gujarat', pin: ['380'], weight: 5, areas: ['Satellite', 'Navrangpura', 'Bopal', 'Maninagar'] },
  { city: 'Surat', stateCode: 'GJ', stateName: 'Gujarat', pin: ['395'], weight: 3, areas: ['Adajan', 'Vesu', 'Varachha'] },
  { city: 'Jaipur', stateCode: 'RJ', stateName: 'Rajasthan', pin: ['302'], weight: 4, areas: ['Malviya Nagar', 'Vaishali Nagar', 'C-Scheme', 'Mansarovar'] },
  { city: 'Indore', stateCode: 'MP', stateName: 'Madhya Pradesh', pin: ['452'], weight: 3, areas: ['Vijay Nagar', 'Palasia', 'Scheme 78'] },
  { city: 'Bhopal', stateCode: 'MP', stateName: 'Madhya Pradesh', pin: ['462'], weight: 2, areas: ['Arera Colony', 'MP Nagar', 'Kolar Road'] },
  { city: 'Kochi', stateCode: 'KL', stateName: 'Kerala', pin: ['682'], weight: 3, areas: ['Edappally', 'Kakkanad', 'Panampilly Nagar'] },
  { city: 'Thiruvananthapuram', stateCode: 'KL', stateName: 'Kerala', pin: ['695'], weight: 2, areas: ['Kowdiar', 'Pattom', 'Vazhuthacaud'] },
  { city: 'Chandigarh', stateCode: 'CH', stateName: 'Chandigarh', pin: ['160'], weight: 2, areas: ['Sector 17', 'Sector 35', 'Sector 22'] },
  { city: 'Ludhiana', stateCode: 'PB', stateName: 'Punjab', pin: ['141'], weight: 2, areas: ['Model Town', 'Sarabha Nagar', 'BRS Nagar'] },
  { city: 'Patna', stateCode: 'BR', stateName: 'Bihar', pin: ['800'], weight: 2, areas: ['Boring Road', 'Kankarbagh', 'Rajendra Nagar'] },
  { city: 'Bhubaneswar', stateCode: 'OD', stateName: 'Odisha', pin: ['751'], weight: 2, areas: ['Saheed Nagar', 'Patia', 'Nayapalli'] },
  { city: 'Guwahati', stateCode: 'AS', stateName: 'Assam', pin: ['781'], weight: 1, areas: ['Ganeshguri', 'Beltola', 'Dispur'] },
  { city: 'Visakhapatnam', stateCode: 'AP', stateName: 'Andhra Pradesh', pin: ['530'], weight: 2, areas: ['MVP Colony', 'Madhurawada', 'Gajuwaka'] },
  { city: 'Dehradun', stateCode: 'UK', stateName: 'Uttarakhand', pin: ['248'], weight: 1, areas: ['Rajpur Road', 'Ballupur', 'Sahastradhara Road'] },
  { city: 'Ranchi', stateCode: 'JH', stateName: 'Jharkhand', pin: ['834'], weight: 1, areas: ['Morabadi', 'Harmu', 'Kanke Road'] },
  { city: 'Panaji', stateCode: 'GA', stateName: 'Goa', pin: ['403'], weight: 1, areas: ['Miramar', 'Porvorim', 'Dona Paula'] },
];

export const STATE_GST_NUMERIC: Record<string, string> = {
  MH: '27', KA: '29', DL: '07', HR: '06', UP: '09', TN: '33', TS: '36', WB: '19', GJ: '24', RJ: '08',
  MP: '23', KL: '32', CH: '04', PB: '03', BR: '10', OD: '21', AS: '18', AP: '37', UK: '05', JH: '20', GA: '30',
};

const MALE_FIRST = [
  'Aarav', 'Vivaan', 'Aditya', 'Arjun', 'Rohan', 'Karan', 'Siddharth', 'Rahul', 'Amit', 'Vikram', 'Nikhil', 'Manish',
  'Harsh', 'Kunal', 'Pranav', 'Ishaan', 'Yash', 'Gaurav', 'Deepak', 'Sanjay', 'Rajesh', 'Anil', 'Suresh', 'Mohan',
  'Tarun', 'Varun', 'Abhishek', 'Ankit', 'Naveen', 'Pradeep', 'Rakesh', 'Sandeep', 'Mahesh', 'Ramesh', 'Vijay', 'Ashok',
  'Imran', 'Farhan', 'Zaid', 'Gurpreet', 'Harpreet', 'Jaspreet', 'Joseph', 'Thomas', 'Prakash', 'Dinesh', 'Lokesh', 'Venkat',
];
const FEMALE_FIRST = [
  'Aanya', 'Diya', 'Ananya', 'Isha', 'Kavya', 'Meera', 'Neha', 'Pooja', 'Priya', 'Riya', 'Sneha', 'Shruti',
  'Tanvi', 'Divya', 'Anjali', 'Swati', 'Nisha', 'Radhika', 'Sakshi', 'Simran', 'Aditi', 'Bhavna', 'Chitra', 'Deepa',
  'Gayatri', 'Heena', 'Jyoti', 'Kiran', 'Lakshmi', 'Madhuri', 'Nandini', 'Pallavi', 'Rekha', 'Sunita', 'Usha', 'Vandana',
  'Fatima', 'Zoya', 'Ayesha', 'Harleen', 'Manpreet', 'Maria', 'Sarah', 'Revathi', 'Padma', 'Shalini', 'Tara', 'Uma',
];
const LAST = [
  'Sharma', 'Verma', 'Gupta', 'Singh', 'Kumar', 'Patel', 'Shah', 'Mehta', 'Joshi', 'Desai', 'Iyer', 'Nair',
  'Menon', 'Reddy', 'Rao', 'Naidu', 'Pillai', 'Kulkarni', 'Deshmukh', 'Patil', 'Chatterjee', 'Banerjee', 'Mukherjee', 'Das',
  'Bose', 'Sen', 'Ghosh', 'Roy', 'Khan', 'Ansari', 'Qureshi', 'Siddiqui', 'Kaur', 'Gill', 'Sandhu', 'Bhatia',
  'Malhotra', 'Kapoor', 'Chopra', 'Arora', 'Khanna', 'Saxena', 'Mishra', 'Tiwari', 'Pandey', 'Yadav', 'Jain', 'Agarwal',
  'Bansal', 'Goyal', 'Thakur', 'Chauhan', 'Rajput', 'Shetty', 'Hegde', 'Bhat', 'Fernandes', 'DSouza', 'Thomas', 'Varghese',
];

export interface PersonName {
  first: string;
  last: string;
  gender: 'MALE' | 'FEMALE';
}

export function personName(rng: Rng): PersonName {
  const gender = rng.chance(0.52) ? 'FEMALE' : 'MALE';
  return {
    first: rng.pick(gender === 'FEMALE' ? FEMALE_FIRST : MALE_FIRST),
    last: rng.pick(LAST),
    gender,
  };
}

/** +91 70000 xxxxx: the block reserved here for fictional numbers. */
export function fictionalPhone(rng: Rng): string {
  return `+9170000${String(rng.int(0, 99999)).padStart(5, '0')}`;
}

const STREETS = [
  'MG Road', 'Station Road', 'Gandhi Nagar Main Road', 'Nehru Marg', 'Residency Road', 'Temple Street', 'Lake View Road',
  'Park Avenue', 'Civil Lines', 'Ring Road', 'Market Road', 'Church Street', 'College Road', 'Shivaji Marg', 'Tagore Lane',
  'Patel Chowk', 'Rose Garden Road', 'Hill View Colony', 'Green Park Extension', 'Sunrise Enclave',
];
const BUILDINGS = ['Sai Residency', 'Krishna Heights', 'Lotus Court', 'Orchid Towers', 'Palm Grove', 'Shanti Niwas', 'Maple Apartments', 'Heritage Villa', 'Silver Oak', 'Skyline Plaza'];
const LANDMARKS = ['Near City Mall', 'Opp. Metro Station', 'Behind Post Office', 'Near Bus Stand', 'Next to Old Market Chowk', 'Near Government School', 'Opp. Central Park', ''];

export interface GeneratedAddress {
  addressLine1: string;
  addressLine2: string | null;
  landmark: string | null;
  city: string;
  stateCode: string;
  stateName: string;
  postalCode: string;
}

/** A pin code that cannot end in 0000 (the stub carrier treats those as unserviceable). */
export function postalCodeFor(city: City, rng: Rng): string {
  for (;;) {
    const code = `${rng.pick(city.pin)}${String(rng.int(1, 999)).padStart(3, '0')}`;
    if (!code.endsWith('0000')) return code;
  }
}

export function pickCity(rng: Rng, homeStateCode: string | null, homeShare: number): City {
  if (homeStateCode && rng.chance(homeShare)) {
    const local = CITIES.filter((c) => c.stateCode === homeStateCode);
    if (local.length > 0) return rng.weighted(local.map((c) => [c, c.weight] as const));
  }
  return rng.weighted(CITIES.map((c) => [c, c.weight] as const));
}

export function addressIn(city: City, rng: Rng): GeneratedAddress {
  const flat = `${rng.pick(['Flat', 'Apt', 'House No.', 'Unit'])} ${rng.int(1, 28)}${rng.pick(['', '', 'A', 'B'])}, ${rng.pick(BUILDINGS)}`;
  const landmark = rng.pick(LANDMARKS);
  return {
    addressLine1: flat,
    addressLine2: `${rng.int(1, 120)}, ${rng.pick(STREETS)}, ${rng.pick(city.areas)}`,
    landmark: landmark || null,
    city: city.city,
    stateCode: city.stateCode,
    stateName: city.stateName,
    postalCode: postalCodeFor(city, rng),
  };
}
