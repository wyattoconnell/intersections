import { Injectable } from '@angular/core';

type Category = {
  category_name: string;
  items: string[];
};

type Categories = {
  [key: string]: Category;
};


@Injectable({
  providedIn: 'root'
})
export class ItemSelectorService {

  constructor() { }

  selectEfficientItems(categories: Categories):  { selectedItems: string[]; intersections: { [key: string]: string[] }} {
    const itemCategories: { [key: string]: string[] } = {};
    const categoryCounts: { [key: string]: number } = {};
    const intersections: { [key: string]: string[] } = {};

    // Initialize category counts and populate itemCategories
    for (const [color, category] of Object.entries(categories)) {
      categoryCounts[color] = 0;
      for (const item of category.items) {
        if (!itemCategories[item]) {
          itemCategories[item] = [];
        }
        if (!itemCategories[item].includes(color)) {
          itemCategories[item].push(color);
        }
      }
    }

    //return itemCategories;
    const selectedItems: string[] = [];
    const remainingCategories = new Set(Object.keys(categories));

    while (remainingCategories.size > 0) {
      let bestItem = '';
      let maxScore = -1;

      for (const [item, cats] of Object.entries(itemCategories)) {
        if (cats.length > 1) {
          for (const cat of cats) {
            if (!intersections[item]) {
              intersections[item] = [];
            }
            if (!intersections[item].includes(cat)) {
              intersections[item].push(cat);
            }
          }
        }
        const relevantCats = cats.filter(cat => remainingCategories.has(cat));
        const score = relevantCats.length;
        if (score > maxScore) {
          maxScore = score;
          bestItem = item;
        }
      }

      if (bestItem) {
        selectedItems.push(bestItem);
        for (const cat of itemCategories[bestItem]) {
          categoryCounts[cat]++;
          if (categoryCounts[cat] >= 3) {
            remainingCategories.delete(cat);
          }
        }
        delete itemCategories[bestItem];
      } 
      
      else {
        // If no best item found, select one item from each remaining category
        for (const cat of remainingCategories) {
          const item = categories[cat].items.find(i => itemCategories[i]);
          if (item) {
            selectedItems.push(item);
            delete itemCategories[item];
          }
          remainingCategories.delete(cat);
        }
      }
    }

    return {selectedItems, intersections};
  }
}