import {describe,it,expect} from 'vitest';
import {content} from '../src/domain/content';
import {brandOrigin,filterCatalogue} from '../src/domain/catalog';

describe('world car catalogue',()=>{
 it('finds real cars by Chinese brand, model and unaccented name',()=>{
  expect(filterCatalogue(content.cars,{query:'法拉利'}).every(c=>c.brand==='Ferrari')).toBe(true);
  expect(filterCatalogue(content.cars,{query:'TESLA model 3'}).map(c=>c.model)).toEqual(['Model 3']);
  expect(filterCatalogue(content.cars,{query:'megane'}).map(c=>c.model)).toEqual(['Mégane Sedan']);
 });
 it('combines country, brand and model without returning unrelated cars',()=>{
  expect(filterCatalogue(content.cars,{origin:'中国',query:'seal'}).map(c=>c.brand)).toEqual(['BYD']);
  expect(filterCatalogue(content.cars,{brand:'Ferrari',origin:'日本'})).toEqual([]);
  expect(filterCatalogue(content.cars,{query:'不存在的车型'})).toEqual([]);
  expect(filterCatalogue(content.cars,{query:'   '})).toEqual(content.cars);
 });
 it('distinguishes brand origin from assembly location for every catalogue brand',()=>{
  for(const car of content.cars)expect(brandOrigin(car.brand),car.brand).toBeTruthy();
 });
});
