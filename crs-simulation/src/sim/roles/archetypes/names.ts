/* =====================================================================================
 * ARCHÉTYPES — noms fictifs plausibles et matricules.
 *
 * Prénoms par sexe et par génération (un retraité ne s'appelle pas comme un lycéen), noms de
 * famille courants en France, d'origines variées comme dans une grande ville. Les combinaisons sont
 * tirées au hasard : toute ressemblance avec une personne existante est fortuite. Les noms de
 * famille attachés à une personnalité publique nationale sont volontairement ABSENTS de la table
 * (EXCLUDED_SURNAMES, vérifié par les tests) : le BRIEF interdit toute personne réelle.
 * ===================================================================================== */

import type { Rng } from '@/core/contracts';

const M_SENIOR = [
  'Jean-Pierre', 'Michel', 'Bernard', 'Alain', 'Gérard', 'Daniel', 'Jacques', 'Christian', 'Claude', 'René',
  'Patrick', 'Serge', 'André', 'Robert', 'Guy', 'Yves', 'Marcel', 'Roger', 'Joël', 'Jean-Claude', 'Henri',
  'Georges', 'Raymond', 'Ahmed', 'Mohamed', 'Antonio', 'José', 'Mamadou', 'Lucien', 'Jean-Louis',
];
const F_SENIOR = [
  'Monique', 'Françoise', 'Nicole', 'Jacqueline', 'Michèle', 'Danielle', 'Martine', 'Chantal', 'Christiane',
  'Annie', 'Josiane', 'Colette', 'Yvette', 'Odile', 'Bernadette', 'Geneviève', 'Fatima', 'Maria', 'Aïcha',
  'Thérèse', 'Brigitte', 'Évelyne', 'Marie-Claude', 'Simone', 'Denise', 'Jeannine', 'Paulette', 'Liliane',
  'Marie-Thérèse', 'Huguette',
];
const M_ADULT = [
  'Christophe', 'Stéphane', 'Laurent', 'Olivier', 'David', 'Frédéric', 'Sébastien', 'Nicolas', 'Thierry',
  'Pascal', 'Éric', 'Franck', 'Jérôme', 'Karim', 'Rachid', 'Samir', 'Vincent', 'Fabrice', 'Cédric', 'Ludovic',
  'Mickaël', 'Arnaud', 'Guillaume', 'Mehdi', 'Ousmane', 'Moussa', 'Carlos', 'Xavier', 'Bruno', 'Yann',
  'Benoît', 'Emmanuel', 'Grégory', 'Farid', 'Hervé', 'Didier', 'Sylvain', 'Abdel', 'Manuel', 'Gilles',
];
const F_ADULT = [
  'Nathalie', 'Isabelle', 'Sandrine', 'Valérie', 'Stéphanie', 'Céline', 'Sophie', 'Karine', 'Virginie',
  'Laurence', 'Christelle', 'Aurélie', 'Delphine', 'Corinne', 'Nadia', 'Samira', 'Malika', 'Laetitia',
  'Émilie', 'Caroline', 'Hélène', 'Séverine', 'Aïssatou', 'Fatou', 'Mélanie', 'Agnès', 'Florence', 'Leïla',
  'Myriam', 'Carole', 'Véronique', 'Catherine', 'Anne', 'Claire', 'Rachida', 'Sylvie', 'Muriel', 'Estelle',
  'Gaëlle', 'Audrey',
];
const M_YOUNG = [
  'Lucas', 'Hugo', 'Thomas', 'Théo', 'Maxime', 'Antoine', 'Alexandre', 'Quentin', 'Julien', 'Kévin', 'Romain',
  'Baptiste', 'Clément', 'Louis', 'Nathan', 'Enzo', 'Yanis', 'Rayan', 'Mathis', 'Adam', 'Ibrahim', 'Amine',
  'Sofiane', 'Bilal', 'Léo', 'Arthur', 'Paul', 'Valentin', 'Dylan', 'Florian', 'Malo', 'Tom', 'Jules',
  'Gabriel', 'Raphaël', 'Noah', 'Ethan', 'Bastien', 'Simon', 'Victor', 'Corentin', 'Younès', 'Idriss',
  'Mamadou', 'Axel', 'Robin', 'Pierre', 'Martin', 'Samy', 'Elias',
];
const F_YOUNG = [
  'Léa', 'Manon', 'Camille', 'Chloé', 'Emma', 'Sarah', 'Inès', 'Marie', 'Laura', 'Pauline', 'Clara', 'Julie',
  'Lucie', 'Océane', 'Mathilde', 'Anaïs', 'Jade', 'Louise', 'Zoé', 'Lina', 'Yasmine', 'Nour', 'Salomé',
  'Margaux', 'Juliette', 'Élise', 'Alice', 'Charlotte', 'Lou', 'Maëlle', 'Romane', 'Agathe', 'Awa', 'Mariam',
  'Fatoumata', 'Noémie', 'Eva', 'Ambre', 'Capucine', 'Lola', 'Justine', 'Margot', 'Elsa', 'Jeanne', 'Sofia',
  'Assia', 'Clémence', 'Morgane', 'Marion', 'Coline',
];
const M_CHILD = [
  'Léo', 'Gabriel', 'Raphaël', 'Louis', 'Jules', 'Adam', 'Noah', 'Liam', 'Hugo', 'Sacha', 'Maël', 'Aaron',
  'Isaac', 'Naël', 'Malo', 'Tiago', 'Marius', 'Gaspard', 'Imran', 'Côme',
];
const F_CHILD = [
  'Jade', 'Louise', 'Emma', 'Alice', 'Ambre', 'Lina', 'Rose', 'Chloé', 'Mia', 'Léna', 'Anna', 'Mila', 'Inaya',
  'Juliette', 'Zoé', 'Nina', 'Romy', 'Iris', 'Adèle', 'Olivia',
];

/** Noms de famille de la table (répandus, d'origines variées). */
export const SURNAMES: readonly string[] = [
  'Martin', 'Bernard', 'Thomas', 'Petit', 'Robert', 'Richard', 'Durand', 'Dubois', 'Moreau', 'Laurent',
  'Simon', 'Michel', 'Lefebvre', 'Lefèvre', 'Leroy', 'Roux', 'David', 'Morel', 'Fournier', 'Girard',
  'Bonnet', 'Dupont', 'Lambert', 'Fontaine', 'Vincent', 'Muller', 'Mercier', 'Blanc', 'Guérin', 'Boyer',
  'Garnier', 'Chevalier', 'François', 'Legrand', 'Gauthier', 'Garcia', 'Perrin', 'Robin', 'Clément', 'Morin',
  'Nicolas', 'Henry', 'Mathieu', 'Gautier', 'Masson', 'Marchand', 'Duval', 'Denis', 'Dumont', 'Marie',
  'Noël', 'Meyer', 'Dufour', 'Meunier', 'Brun', 'Blanchard', 'Giraud', 'Joly', 'Rivière', 'Lucas',
  'Brunet', 'Gaillard', 'Barbier', 'Arnaud', 'Gérard', 'Roche', 'Renard', 'Schmitt', 'Roy', 'Leroux',
  'Colin', 'Vidal', 'Caron', 'Picard', 'Roger', 'Fabre', 'Aubert', 'Lemoine', 'Renaud', 'Dumas',
  'Lacroix', 'Olivier', 'Bourgeois', 'Pierre', 'Benoît', 'Rey', 'Payet', 'Rolland', 'Leclercq', 'Guillaume',
  'Lecomte', 'Lopez', 'Dupuy', 'Guillot', 'Hubert', 'Carpentier', 'Sanchez', 'Dupuis', 'Moulin', 'Huet',
  'Vasseur', 'Perez', 'Boucher', 'Fleury', 'Royer', 'Klein', 'Jacquet', 'Poirier', 'Marty', 'Guyot',
  'Carré', 'Charpentier', 'Ménard', 'Maillard', 'Baron', 'Bertin', 'Bailly', 'Hervé', 'Fernandez', 'Le Gall',
  'Collet', 'Léger', 'Bouvier', 'Prévost', 'Millet', 'Perrot', 'Le Roux', 'Cousin', 'Germain', 'Breton',
  'Besson', 'Langlois', 'Rémy', 'Le Goff', 'Pelletier', 'Lévêque', 'Leblanc', 'Barré', 'Lebrun', 'Marchal',
  'Weber', 'Mallet', 'Boulanger', 'Jacob', 'Monnier', 'Michaud', 'Rodriguez', 'Guichard', 'Gillet', 'Étienne',
  'Grondin', 'Tessier', 'Chevallier', 'Collin', 'Chauvin', 'Da Silva', 'Bouchet', 'Lemaître', 'Bénard',
  'Humbert', 'Reynaud', 'Hoarau', 'Perret', 'Barthélemy', 'Cordier', 'Pichon', 'Lejeune', 'Lamy', 'Delaunay',
  'Pasquier', 'Carlier', 'Laporte', 'Nguyen', 'Tran', 'Pham', 'Hoang', 'Diallo', 'Traoré', 'Diarra',
  'Koné', 'Coulibaly', 'Camara', 'Sow', 'Ndiaye', 'Sylla', 'Cissé', 'Touré', 'Keita', 'Benali',
  'Benhaddou', 'Bouzid', 'Haddad', 'Mansouri', 'Cherif', 'Saïdi', 'Meziane', 'Amrani', 'Khelifi', 'Hamidi',
  'Brahimi', 'Slimani', 'Ferreira', 'Pereira', 'Dos Santos', 'Rodrigues', 'Gomes', 'Fernandes', 'Lopes',
  'Oliveira', 'Costa', 'Marques', 'Rossi', 'Russo', 'Romano', 'Kowalski', 'Nowak', 'Yilmaz', 'Kaya',
  'Demir', 'Cohen', 'Lévy', 'Benhamou', 'Zhang', 'Chen', 'Wang', 'Singh', 'Kumar', 'Popescu',
  'Gonzalez', 'Hernandez', 'Ramos', 'Moreno',
];

/**
 * Noms de famille écartés de la table parce qu'ils désignent d'abord, pour le public, une
 * personnalité politique, syndicale ou préfectorale (minuscules, sans accent). Liste de contrôle
 * utilisée par les tests ; elle n'a pas à être exhaustive pour jouer son rôle de garde-fou.
 */
export const EXCLUDED_SURNAMES: readonly string[] = [
  'macron', 'le pen', 'melenchon', 'hollande', 'sarkozy', 'chirac', 'mitterrand', 'philippe', 'castex',
  'borne', 'attal', 'bardella', 'zemmour', 'hidalgo', 'darmanin', 'lallement', 'nunez', 'martinez', 'berger',
  'binet', 'roussel', 'faure', 'bayrou', 'barnier', 'retailleau', 'ruffin', 'wauquiez', 'ciotti', 'bertrand',
  'royal', 'valls', 'fillon', 'juppe', 'pecresse', 'dati', 'veran', 'le maire', 'lemaire', 'blanquer',
  'castaner', 'collomb', 'cazeneuve', 'jospin', 'aubry', 'taubira', 'poutou', 'arthaud', 'besancenot',
  'jadot', 'lassalle', 'panot', 'bompard', 'rousseau', 'tondelier', 'autain', 'larcher', 'lecornu',
  'dussopt', 'schiappa', 'buzyn', 'vautrin', 'hamon', 'marechal', 'belkacem', 'papon', 'grimaud',
  'delpuech', 'cadot', 'mailly', 'thibault', 'chereque', 'notat', 'veyrier', 'souillot', 'leon',
];

function pool(sex: number, age: number): readonly string[] {
  if (age < 16) return sex === 1 ? F_CHILD : M_CHILD;
  if (age < 34) return sex === 1 ? F_YOUNG : M_YOUNG;
  if (age < 60) return sex === 1 ? F_ADULT : M_ADULT;
  return sex === 1 ? F_SENIOR : M_SENIOR;
}

/** Prénom adapté au sexe (0 homme, 1 femme) et à l'âge. */
export function pickFirstName(rng: Rng, sex: number, age: number): string {
  // une personne sur six porte un prénom de la génération voisine
  const shift = rng.next();
  const a = shift < 0.08 ? age + 22 : shift < 0.16 && age >= 34 ? age - 22 : age;
  const names = pool(sex, age < 16 ? age : a < 16 ? 16 : a);
  return names[rng.int(0, names.length)]!;
}

export function pickSurname(rng: Rng): string {
  return SURNAMES[rng.int(0, SURNAMES.length)]!;
}

/** « Prénom Nom ». */
export function makeName(rng: Rng, sex: number, age: number): string {
  const first = pickFirstName(rng, sex, age);
  return first + ' ' + pickSurname(rng);
}

/** Ramène un nom en minuscules sans accent (comparaison avec les listes de contrôle). */
export function foldName(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Tables de prénoms, pour les tests. */
export const FIRST_NAME_POOLS: readonly (readonly string[])[] = [
  M_SENIOR, F_SENIOR, M_ADULT, F_ADULT, M_YOUNG, F_YOUNG, M_CHILD, F_CHILD,
];

/**
 * Matricules RIO : numéro individuel à sept chiffres porté sur la poitrine (docs/research/
 * 02-materiel-tenues-vehicules.md §1.2). Unique au sein d'une session.
 */
export class RioRegistry {
  private readonly used = new Set<number>();

  clear(): void {
    this.used.clear();
  }

  /** Tire un matricule libre à partir de `rng`. */
  next(rng: Rng): string {
    let n = 1000000 + rng.int(0, 9000000);
    // collision (rarissime) : on avance jusqu'au premier numéro libre
    while (this.used.has(n)) n = n >= 9999999 ? 1000000 : n + 1;
    this.used.add(n);
    return String(n);
  }

  /** Enregistre un matricule déjà attribué (personne créée ailleurs) ; false s'il était pris. */
  claim(rio: string): boolean {
    const n = Number(rio);
    if (!Number.isInteger(n) || this.used.has(n)) return false;
    this.used.add(n);
    return true;
  }
}
