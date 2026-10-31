import type {Car} from './content';

// Brand origins, not the country where a particular vehicle was manufactured.
const origins: Record<string, string> = {
  Lamborghini:'意大利', Ferrari:'意大利', Pagani:'意大利', Maserati:'意大利',
  'Alfa Romeo':'意大利', Fiat:'意大利',
  Porsche:'德国', BMW:'德国', 'Mercedes-AMG':'德国', 'Mercedes-Benz':'德国', Audi:'德国', Volkswagen:'德国',
  McLaren:'英国', 'Aston Martin':'英国', Lotus:'英国', Jaguar:'英国', 'Rolls-Royce':'英国', 'Land Rover':'英国', MINI:'英国',
  Lexus:'日本', Toyota:'日本', Nissan:'日本', Mazda:'日本', Honda:'日本', Subaru:'日本', Mitsubishi:'日本', Datsun:'日本', Suzuki:'日本',
  Chevrolet:'美国', Dodge:'美国', Ford:'美国', Pontiac:'美国', Tesla:'美国', Cadillac:'美国', Buick:'美国', Hummer:'美国',
  Bugatti:'法国', Alpine:'法国', Peugeot:'法国', Renault:'法国',
  Koenigsegg:'瑞典', Volvo:'瑞典', Hyundai:'韩国', BYD:'中国',
};
export const brandOrigin = (brand: string) => origins[brand];
const normalize = (value: string) => value.normalize('NFKD').replace(/\p{Diacritic}/gu,'').toLowerCase();
export function filterCatalogue(cars: Car[], {brand='all',origin='all',query=''}: {brand?:string;origin?:string;query?:string}) {
  const terms = normalize(query).trim().split(/\s+/).filter(Boolean);
  return cars.filter(car => (brand==='all'||car.brand===brand) && (origin==='all'||brandOrigin(car.brand)===origin) &&
    terms.every(term=>normalize(`${car.name} ${car.brand} ${car.zhBrand} ${car.model}`).includes(term)));
}
