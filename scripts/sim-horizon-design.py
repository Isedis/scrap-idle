"""Standalone proposal model. No game save, UME wait, or release balance is simulated."""
import math


def simulate(label, auto=True, mode="balance", growth_minutes=0):
    wallet = 20.0
    levels = {"transport": 0, "processing": 0, "assembly": 0}
    hall = 0
    built = 0.0
    for minute in range(1, 4321):
        transport = 4 * 1.5 ** levels["transport"] * 2 ** hall
        processing = 4 * 1.5 ** levels["processing"] * 2 ** hall
        production = min(transport, processing)
        assembly = 12 * 1.5 ** levels["assembly"] * (1.25 if hall >= 4 else 1)
        target = 280 * 8 ** hall
        current_mode = "growth" if minute <= growth_minutes else mode
        budget = 0 if current_mode == "growth" else production * .5 if current_mode == "balance" else wallet + production
        work = min(target - built, assembly, budget)
        wallet += production - work
        built += work
        if auto:
            offers = []
            if transport <= processing:
                offers.append((math.ceil(20 * 1.8 ** levels["transport"]), 0, "transport"))
            if processing <= transport:
                offers.append((math.ceil(30 * 1.8 ** levels["processing"]), 1, "processing"))
            allowed_flow = production * .5 if current_mode == "balance" else production
            if current_mode != "growth" and assembly < allowed_flow:
                offers.append((math.ceil(25 * 1.8 ** levels["assembly"]), 2, "assembly"))
            affordable = [offer for offer in offers if offer[0] <= wallet]
            if affordable:
                price, _, kind = min(affordable)
                wallet -= price
                levels[kind] += 1
        if built >= target - 1e-8:
            print(f"{label}: gate {hall + 1}, minute {minute}, output {production:.2f}, levels {levels}")
            hall += 1
            built = 0
            if hall == 5:
                return
    print(f"{label}: chapter unfinished after 72 model hours")


if __name__ == "__main__":
    simulate("balanced-auto")
    simulate("growth-15-then-balance", growth_minutes=15)
    simulate("assembly-no-upgrades", auto=False, mode="assembly")
