package com.example.app.service;

import com.example.app.model.Item;
import com.example.app.repository.ItemRepository;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class ItemService {

    private final ItemRepository itemRepository;

    public ItemService(ItemRepository itemRepository) {
        this.itemRepository = itemRepository;
    }

    public List<Item> getAllItems() {
        return itemRepository.findAll();
    }

    public Item createItem(String name) {
        Item item = new Item(name);
        return itemRepository.save(item);
    }
}
