/**
 * Cosmetic survivor-name rolls for character creation.
 * Full names drawn from everyday Singapore Chinese, Malay, Indian, and Eurasian /
 * Western patterns. Purely cosmetic — Math.random is fine.
 *
 * Keep the lists mainstream and family-safe: no honorifics, no pejorative
 * nicknames, no bin/binti patronymics, no political or religious-figure
 * name-drops.
 */

/** Must stay ≤ CharacterCreate name input maxLength. */
export const SURVIVOR_NAME_MAX = 24;

type NamePool = {
  /** How to join given + family for this community. */
  order: 'surname-given' | 'given-surname';
  given: readonly string[];
  family: readonly string[];
};

/** Chinese SG English forms often put the family name first. */
const CHINESE: NamePool = {
  order: 'surname-given',
  given: [
    'Wei Jie',
    'Mei Ling',
    'Jia Hui',
    'Xin Yi',
    'Kai Wen',
    'Yi Ling',
    'Hao Ming',
    'En Qi',
    'Yu Ting',
    'Shu Hui',
    'Jun Hao',
    'Jia Xin',
    'Wei Ming',
    'Hui Min',
    'Zhi Hao',
    'An Qi',
    'Pei Ling',
    'Wei Liang',
    'Jing Yi',
    'Si Hui',
    'Yan Ting',
    'Kai',
    'Rui',
    'Xuan',
  ],
  family: [
    'Tan',
    'Lim',
    'Lee',
    'Ng',
    'Wong',
    'Ong',
    'Goh',
    'Chua',
    'Koh',
    'Teo',
    'Ang',
    'Chan',
    'Chong',
    'Yap',
    'Sim',
    'Yeo',
    'Toh',
    'Low',
    'Ho',
    'Quek',
  ],
};

/** Malay given + family surname (no patronymic markers). */
const MALAY: NamePool = {
  order: 'given-surname',
  given: [
    'Aisyah',
    'Amir',
    'Farah',
    'Hafiz',
    'Nadia',
    'Danial',
    'Hana',
    'Irfan',
    'Liyana',
    'Hakim',
    'Suraya',
    'Faisal',
    'Amira',
    'Rizal',
    'Aiman',
    'Yasmin',
    'Syafiq',
    'Balqis',
    'Iskandar',
    'Zainab',
    'Nurul',
    'Haziq',
    'Sabrina',
    'Azlan',
  ],
  family: [
    'Rahman',
    'Hassan',
    'Ismail',
    'Yusof',
    'Ibrahim',
    'Osman',
    'Hamid',
    'Salleh',
    'Bakar',
    'Latif',
    'Aziz',
    'Samad',
    'Omar',
    'Rashid',
    'Zainal',
  ],
};

const INDIAN: NamePool = {
  order: 'given-surname',
  given: [
    'Priya',
    'Arjun',
    'Kavitha',
    'Anand',
    'Deepa',
    'Rajesh',
    'Meera',
    'Suresh',
    'Lakshmi',
    'Vijay',
    'Divya',
    'Ravi',
    'Shanti',
    'Karthik',
    'Ananya',
    'Nisha',
    'Rohan',
    'Geetha',
    'Sanjay',
    'Kavya',
    'Dinesh',
    'Malathi',
    'Arun',
    'Naveen',
  ],
  family: [
    'Nair',
    'Menon',
    'Krishnan',
    'Pillai',
    'Singh',
    'Sharma',
    'Rao',
    'Iyer',
    'Reddy',
    'Das',
    'Thomas',
    'Joseph',
    'Nathan',
    'Raj',
    'Kumar',
  ],
};

/** Eurasian family names plus Western given names common in SG. */
const EURASIAN_WESTERN: NamePool = {
  order: 'given-surname',
  given: [
    'Marcus',
    'Cheryl',
    'Darren',
    'Denise',
    'Ryan',
    'Rachel',
    'Jason',
    'Michelle',
    'Kevin',
    'Amanda',
    'Brandon',
    'Stephanie',
    'Alex',
    'Jordan',
    'Natalie',
    'Ethan',
    'Jasmine',
    'Benjamin',
    'Claire',
    'Adrian',
    'Melissa',
    'Nicholas',
    'Valerie',
    'Daniel',
  ],
  family: [
    'Pereira',
    'Rodrigues',
    'Fernandez',
    "D'Silva",
    'Monteiro',
    'De Souza',
    'Gomes',
    'Pinto',
    'Dias',
    'Costa',
    'Smith',
    'Tan',
    'Lim',
    'Wong',
    'Ng',
  ],
};

const POOLS: readonly NamePool[] = [CHINESE, MALAY, INDIAN, EURASIAN_WESTERN];

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function formatFullName(pool: NamePool): string {
  const given = pick(pool.given);
  const family = pick(pool.family);
  return pool.order === 'surname-given' ? `${family} ${given}` : `${given} ${family}`;
}

/** Roll a full name. Retries a few times to avoid repeating the current value. */
export function randomSurvivorName(exclude?: string): string {
  const skip = exclude?.trim().toLowerCase();
  let fallback = 'Tan Mei Ling';
  for (let i = 0; i < 24; i++) {
    const name = formatFullName(pick(POOLS));
    if (name.length > SURVIVOR_NAME_MAX) continue;
    fallback = name;
    if (!skip || name.toLowerCase() !== skip) return name;
  }
  return fallback;
}
