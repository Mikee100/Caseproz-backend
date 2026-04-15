const mongoose = require('mongoose');
const dotenv = require('dotenv');
const Category = require('./models/Category');
const Brand = require('./models/Brand');

dotenv.config();

const categoriesData = {
    "Computers & Laptops": [
        "Laptops", "Desktops", "Monitors", "Printers & Scanners", "Networking Equipment", "Storage Devices"
    ],
    "Phones & Tablets": [
        "Smartphones", "Tablets", "iPhones", "iPads", "Phone Accessories"
    ],
    "Audio & Headphones": [
        "Bluetooth Speakers", "Earbuds & In-ear", "Over-ear Headphones", "Home Audio Systems", "Microphones"
    ],
    "Power & Solar": [
        "Portable Power Stations", "Solar Panels", "Power Banks", "UPS & Inverters", "Batteries"
    ],
    "Smart Home": [
        "Security Cameras", "Smart Lighting", "Smart Plugs", "Home Automation"
    ],
    "Gaming": [
        "Consoles", "Gaming Laptops", "Gaming Accessories", "Games"
    ],
    "Photography & Video": [
        "Cameras", "Lenses", "Gimbals & Stabilizers", "Photography Accessories"
    ],
    "Accessories": [
        "Cables & Adapters", "Cases & Covers", "Keyboard & Mouse", "Laptop Bags"
    ]
};

const brandsData = [
    'Anker', 'Baseus', 'Belkin', 'Bluetti', 'DJI', 'EcoFlow', 'Eufy by Anker', 
    'JBL', 'Logitech', 'Samsung', 'Sandisk', 'Soundcore by Anker', 'TP Link'
];

const seed = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB');

        // Clear existing categories and brands (Optional, but safer for a "lets do it" approach if they want to match)
        // Actually, let's just Upsert to avoid deleting data the user might have added.
        
        console.log('Seeding Categories...');
        for (const [catName, subCats] of Object.entries(categoriesData)) {
            const subCategories = subCats.map(name => ({ name }));
            await Category.findOneAndUpdate(
                { name: catName },
                { name: catName, subCategories },
                { upsert: true, new: true }
            );
        }

        console.log('Seeding Brands...');
        for (const brandName of brandsData) {
            await Brand.findOneAndUpdate(
                { name: brandName },
                { name: brandName },
                { upsert: true, new: true }
            );
        }

        console.log('Seeding complete!');
        process.exit();
    } catch (error) {
        console.error('Error seeding:', error);
        process.exit(1);
    }
};

seed();
