import time
from sqlalchemy.exc import OperationalError
# --- THE FIX: We now also import the Preset model ---
from main import app, db, Preset, TelegramRecipient
from utils import get_default_qctools_preset

print("DB Initializer: Waiting for database to be ready...")
retries = 5
while retries > 0:
    try:
        with app.app_context():
            # Step 1: Create all tables (Job, Preset)
            db.create_all()

            # --- THE FIX: Seeding logic ---
            # Step 2: Check if a 'Default' preset already exists.
            if not Preset.query.filter_by(name='Default').first():
                print("DB Initializer: No default preset found. Creating one...")
                
                # Step 3: If it doesn't exist, create it.
                default_preset = Preset(
                    name='Default',
                    parameters=get_default_qctools_preset()
                )
                db.session.add(default_preset)
                db.session.commit()
                print("DB Initializer: Default preset created successfully.")
            else:
                print("DB Initializer: Default preset already exists.")

        print("DB Initializer: Database is ready.")
        break  # Exit the loop if successful
    except OperationalError:
        retries -= 1
        print(f"DB Initializer: Database not ready, retrying... ({retries} retries left)")
        time.sleep(3)
