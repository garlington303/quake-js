#!/usr/bin/env python3
"""
Generate curated props.fgd — run once to produce the file.
Only keeps decorative/functional props. Removes structural geometry props
(pillars, arcs, doorways, walls, floors, windows, pipes, planks, stairs).
"""

import os

OUTPUT = os.path.join(os.path.dirname(__file__), '..', 'trenchbroom', 'props.fgd')

def display(name):
    return name.replace('_', ' ').title()

def preview_entry(name):
    return (
        f'@PointClass model("preview/{name}/{name}.obj") '
        f'size(-16 -16 -16, 16 16 16) color(0 255 128) = prop_{name} : "{display(name)}"\n'
        f'[\n'
        f'    angle(angle) : "Yaw rotation (0=North, 90=East)" : 0\n'
        f'    scale(float) : "Uniform scale" : 32.0\n'
        f']\n'
    )

def mdl_entry(name):
    return (
        f'@PointClass model("pak-extracted/progs/custom/{name}.mdl") '
        f'size(-16 -16 -16, 16 16 16) color(0 255 128) = prop_{name} : "{display(name)}"\n'
        f'[\n'
        f'    angle(angle) : "Yaw rotation (0=North, 90=East)" : 0\n'
        f'    scale(float) : "Uniform scale" : 32.0\n'
        f']\n'
    )

def section(title, entries):
    sep = '// ' + '=' * 60
    lines = [sep, f'// PROPS - {title}', sep, '']
    lines += entries
    lines.append('')
    return '\n'.join(lines)

# ─── ITEMS & WEAPONS (all have preview OBJ + GLB — fully functional) ──────────

items_preview = [
    # Ammo boxes
    'ammo_box_1', 'ammo_box_1_1',
    'ammo_box_mp_1', 'ammo_box_mp_1_1',
    'ammo_box_mp_2', 'ammo_box_mp_2_1',
    'ammo_box_mp_3', 'ammo_box_mp_3_1',
    'ammo_box_mp_4', 'ammo_box_mp_4_1',
    'ammo_box_mp_5', 'ammo_box_mp_5_1',
    # Pistol ammo
    'ammo_pistol_loose_1pc_mp_1', 'ammo_pistol_loose_1pc_mp_2', 'ammo_pistol_loose_1pc_mp_3',
    'ammo_pistol_loose_2pcs_mp_2',
    'ammo_pistol_loose_3pcs_mp_1',
    'ammo_pistol_loose_4pcs_mp_3',
    'ammo_pistol_loose_5pcs_mp_1', 'ammo_pistol_loose_5pcs_mp_2',
    'ammo_pistol_loose_mp_1_casing', 'ammo_pistol_loose_mp_2_casing', 'ammo_pistol_loose_mp_3_casing',
    # Batteries
    'battery_mp_1', 'battery_mp_1_1',
    'battery_mp_2', 'battery_mp_2_1',
    'battery_mp_3_1', 'battery_mp_3_2',
    # Food
    'canned_food_mp_1', 'canned_food_mp_2', 'canned_food_mp_3', 'canned_food_mp_4', 'canned_food_mp_5_rusty',
    # Money
    'cash_1', 'cash_1_2', 'cash_2', 'cash_2_1', 'cash_3', 'cash_3_1', 'cash_4', 'cash_5', 'cash_5_1', 'cash_6', 'cash_6_1',
    # Media
    'cassette_tape_mp_1', 'cassette_tape_mp_2',
    'floppy_disc_1',
    # Phones
    'cell_phone_1', 'cell_phone_2',
    # Smokes
    'cigs_packet_1',
    # Currency
    'coin_mp_1',
    # Dosimeters
    'dosimeter_1', 'dosimeter_2', 'dosimeter_4',
    # Lights (handheld)
    'flashlight_1', 'flashlight_mp_1',
    # Bottles
    'glass_bottle_1', 'glass_bottle_2',
    # Tools
    'butcher_knife_mp_1',
    'hand_saw_1',
    'screwdriver_mp_1', 'screwdriver_mp_1_1', 'screwdriver_mp_1_2',
    'screwdriver_mp_2', 'screwdriver_mp_2_1', 'screwdriver_mp_2_2',
    # Keys
    'key_mp_1', 'key_mp_1_1', 'key_mp_1_2',
    'key_mp_2', 'key_mp_2_1', 'key_mp_2_2',
    'key_mp_3', 'key_mp_3_1', 'key_mp_3_2',
    'keycard_1', 'keycard_1_1', 'keycard_1_2', 'keycard_1_3',
    'keycard_1_authorization_level_1', 'keycard_1_authorization_level_2',
    'keycard_1_authorization_level_3', 'keycard_1_authorization_level_4',
    # Fire
    'lighter_mp_1', 'lighter_mp_1_1', 'lighter_mp_1_2',
    'matchbox_1', 'matchbox_2',
    # Medical
    'meat_1',
    'pills_1', 'pills_bottle_1', 'pills_bottle_1_1', 'pills_bottle_1_2', 'pills_packet_1',
    'syringe_mp_1', 'syringe_mp_1_1',
    # Stationery
    'nails_1', 'nails_1_rusty',
    'notebook_1',
    # Weapons
    'pistol_mp_1', 'pistol_mp_1_1', 'pistol_mp_1_2', 'pistol_mp_1_3',
    'pistol_mp_1_mag_empty', 'pistol_mp_1_mag_extended_empty',
    'pistol_mp_1_mag_extended_loaded', 'pistol_mp_1_mag_loaded',
    'shotgun_1',
    'shotgun_ammo_1', 'shotgun_ammo_2', 'shotgun_ammo_2_1',
    'suppressor_mp_1', 'suppressor_mp_2',
    # Comms
    'walkie_talkie_1',
    # Misc
    'tunnel_entrance_platform_1',
]

# ─── LIGHTING (MDL only — needs GLB generation to render in-game) ─────────────

lighting_mdl = [
    # Floor lamps
    'lamp_1_off', 'lamp_1_on',
    'lamp_2_off', 'lamp_2_on',
    'lamp_3_off', 'lamp_3_on',
    'lamp_3_1_off', 'lamp_3_1_on',
    # Ceiling lamps
    'ceiling_lamp_1_off', 'ceiling_lamp_1_on',
    'ceiling_lamp_1_fake_light_1', 'ceiling_lamp_1_fake_light_2',
    'ceiling_lamp_2_off', 'ceiling_lamp_2_on',
    'ceiling_lamp_2_fake_light_1', 'ceiling_lamp_2_fake_light_2',
    'ceiling_lamp_4_off', 'ceiling_lamp_4_on',
    'ceiling_lamp_4_a_off', 'ceiling_lamp_4_a_on',
    'ceiling_lamp_4_b_off', 'ceiling_lamp_4_b_on',
    'ceiling_lamp_4_1_off', 'ceiling_lamp_4_1_on',
    'ceiling_lamp_4_1_a_off', 'ceiling_lamp_4_1_a_on',
    'ceiling_lamp_4_1_b_off', 'ceiling_lamp_4_1_b_on',
    'ceiling_lamp_mp_1_off', 'ceiling_lamp_mp_1_on',
    'ceiling_lamp_mp_1_1_off', 'ceiling_lamp_mp_1_1_on',
    'ceiling_lamp_mp_1_1_fake_light_1', 'ceiling_lamp_mp_1_1_fake_light_2',
    # Ceiling fans (with light variants)
    'ceiling_fan_mp_1',
    'ceiling_fan_mp_1_1_light_off', 'ceiling_fan_mp_1_1_light_on',
    'ceiling_fan_mp_2',
    'ceiling_fan_mp_2_1_light_off', 'ceiling_fan_mp_2_1_light_on',
    # Switches
    'light_switch_1',
]

# ─── FURNITURE (MDL only — needs GLB) ─────────────────────────────────────────

furniture_mdl = [
    # Chairs (base variants only — texture swaps trimmed)
    'chair_mp_1', 'chair_mp_2', 'chair_mp_3', 'chair_mp_4',
    # Shelves (base variants — texture swaps trimmed)
    'shelf_mp_2', 'shelf_mp_3', 'shelf_mp_4', 'shelf_mp_5',
    # Tables
    'table_large_2', 'table_large_3',
    # Sofas (base variants)
    'sofa_1', 'sofa_2', 'sofa_3', 'sofa_4',
    # Beds (base variants)
    'bed_1', 'bed_2', 'bed_4', 'bed_5',
    'old_mattress_mp_1', 'old_mattress_mp_1_1',
    'pillow_mp_1', 'pillow_mp_2',
    # Side tables
    'bedside_table_1', 'bedside_table_2',
    'coffee_table_1',
    # Storage furniture
    'display_cabinet_mp_1', 'display_cabinet_mp_2',
    'wardrobe_mp_1',
    # TV furniture
    'tv_table_1', 'tv_table_4',
    # Bathroom
    'toilet_mp_1', 'toilet_cabin_mp_1',
]

# ─── ELECTRONICS (MDL only — needs GLB) ───────────────────────────────────────

electronics_mdl = [
    # PC setup
    'pc_mp_1', 'pc_monitor_mp_1',
    'pc_keyboard_mp_1', 'pc_keyboard_mp_2', 'pc_keyboard_mp_3',
    'pc_mouse_mp_1', 'pc_mouse_mp_2',
    'pc_speaker_1_left', 'pc_speaker_1_right',
    'mouse_pad_mp_1',
    # TV / screens
    'tv_mp_1', 'tv_mp_1_1', 'tv_mp_1_2', 'tv_remote_mp_1',
    'monitoring_screen_mp_1', 'monitoring_screen_mp_1_1',
    # Handheld
    'handheld_game_console_1', 'handheld_tablet_1',
    'cell_phone_3', 'cell_phone_battery_1', 'cell_phone_battery_2',
    # Controls / panels
    'keypad_1', 'keypad_2',
    'button_12',
    'electrical_outlet_1',
    # Vending
    'vending_machine_1',
]

# ─── DECOR & CLUTTER (MDL only — needs GLB) ───────────────────────────────────

decor_mdl = [
    # Smoking
    'ashtray_1', 'cig_1', 'cig_2', 'cig_3',
    # Reading material
    'book_mp_1', 'book_mp_2', 'book_mp_3', 'book_mp_4', 'book_mp_5',
    'book_mp_6', 'book_mp_7', 'book_mp_8', 'book_mp_9', 'book_mp_10',
    'open_book_mp_1',
    # Wall decor
    'clock_1', 'clock_2',
    'cross_1',
    'painting_1',
    'curtain_rod_mp_1',
    # Atmosphere
    'cobweb_1', 'cobweb_2', 'cobweb_4', 'cobweb_5',
    # Tableware
    'plate_mp_1', 'spoon_mp_1',
    # Toys
    'toy_brick_1', 'toy_brick_1_1', 'toy_brick_1_2', 'toy_brick_1_3',
    # Media
    'vhs_tape_1',
    # Security
    'padlock_1', 'padlock_2', 'padlock_3', 'padlock_4',
]

# ─── STORAGE & ENVIRONMENT (MDL only — needs GLB) ────────────────────────────

storage_mdl = [
    # Barrels
    'metal_barrel_mp_1', 'metal_barrel_mp_2', 'metal_barrel_mp_3',
    # Crates & boxes
    'supply_crate_1', 'supply_crate_1_empty',
    'cardboard_box_1', 'cardboard_box_2',
    # Liquids / fuel
    'jerrycan_1',
    # Structural accent (kept as decor, not geometry)
    'bars_metal_1', 'bars_metal_2',
    # HVAC
    'vent_1', 'vent_2',
    # Misc environment
    'car_battery_1',
    'carpet_mp_1',
    'walkie_talkie_2',
    'tin_can_mp_1_rusty', 'tin_can_mp_1_rusty_1',
]

# ─── Build file ───────────────────────────────────────────────────────────────

all_entries = (
    [preview_entry(n) for n in items_preview]
    + [mdl_entry(n) for n in lighting_mdl]
    + [mdl_entry(n) for n in furniture_mdl]
    + [mdl_entry(n) for n in electronics_mdl]
    + [mdl_entry(n) for n in decor_mdl]
    + [mdl_entry(n) for n in storage_mdl]
)
total = len(all_entries)

lines = [
    f'// props.fgd — Curated prop entities',
    f'// Edit by hand. To add props, add the name to the relevant list in',
    f'// scripts/write_curated_fgd.py and re-run it.',
    f'//',
    f'// {total} props total',
    f'// ✅ ITEMS & WEAPONS section: preview OBJ + GLB = renders in-game + TrenchBroom preview',
    f'// ⚠️  All other sections: MDL only — no in-game render until GLBs are generated',
    f'',
    '',
]

lines.append(section('ITEMS & WEAPONS', [preview_entry(n) for n in items_preview]))
lines.append(section('LIGHTING', [mdl_entry(n) for n in lighting_mdl]))
lines.append(section('FURNITURE', [mdl_entry(n) for n in furniture_mdl]))
lines.append(section('ELECTRONICS', [mdl_entry(n) for n in electronics_mdl]))
lines.append(section('DECOR & CLUTTER', [mdl_entry(n) for n in decor_mdl]))
lines.append(section('STORAGE & ENVIRONMENT', [mdl_entry(n) for n in storage_mdl]))

content = '\n'.join(lines)

with open(OUTPUT, 'w', encoding='utf-8') as f:
    f.write(content)

print(f'Written {OUTPUT}')
print(f'Total props: {total}')
print(f'  Items & Weapons (✅ GLB+preview): {len(items_preview)}')
print(f'  Lighting (⚠️ MDL only):           {len(lighting_mdl)}')
print(f'  Furniture (⚠️ MDL only):          {len(furniture_mdl)}')
print(f'  Electronics (⚠️ MDL only):        {len(electronics_mdl)}')
print(f'  Decor & Clutter (⚠️ MDL only):    {len(decor_mdl)}')
print(f'  Storage & Env (⚠️ MDL only):      {len(storage_mdl)}')
